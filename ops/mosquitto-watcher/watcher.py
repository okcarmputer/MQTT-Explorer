#!/usr/bin/env python3
"""
Mosquitto broker watcher for sv-dg-p00-mid.
Checks container health, disk space, and Mosquitto logs for auth failures,
TLS errors, and unrecognized client connections. Posts alerts (and
resolutions) to a Microsoft Teams channel via an HTTP webhook.

No local log file is written by design -- findings go to Teams. A small
state.json tracks de-dup state and the known-connection baseline; it holds
no message content, only status.
"""

import json
import os
import re
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone

BASE_DIR = "/opt/mosquitto-watcher"
WEBHOOK_FILE = os.path.join(BASE_DIR, "webhook_url.txt")
STATE_FILE = os.path.join(BASE_DIR, "state.json")
CONTAINER_NAME = "mosquitto"
DISK_THRESHOLD_PCT = 75
HOST = "sv-dg-p00-mid"

# Mounts to watch; skip virtual filesystems.
SKIP_FSTYPES = {"tmpfs", "devtmpfs", "efivarfs", "overlay", "squashfs"}

CONNECT_RE = re.compile(
    r"New client connected from (?P<ip>[\d.]+):\d+ as (?P<clientid>\S+) "
    r"\(p\d+, c\d+, k\d+, u'(?P<username>[^']*)'\)"
)
AUTH_FAIL_RE = re.compile(r"not authorised", re.IGNORECASE)
TLS_ERROR_RE = re.compile(
    r"(TLS.*(error|Handshake)|SSL.*(error|failed)|"
    r"tlsv1 alert|certificate verify failed|unsupported protocol|"
    r"no shared cipher)",
    re.IGNORECASE,
)
# Mosquitto logs this whenever a client drops a TLS connection without a
# clean shutdown (network blip, device reboot). It is routine noise, not
# evidence of a cert/handshake problem, so it's excluded even though it
# contains "SSL".
TLS_BENIGN_RE = re.compile(
    r"OpenSSL Error while trying to get the error.*unexpected eof while reading",
    re.IGNORECASE,
)


def load_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            pass
    return {
        "first_run_done": False,
        "known_connections": [],
        "active_alerts": {},
        "last_check_iso": None,
    }


def save_state(state):
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, indent=2)
    os.replace(tmp, STATE_FILE)


def read_webhook_url():
    with open(WEBHOOK_FILE, "r") as f:
        url = f.read().strip()
    if not url:
        raise RuntimeError("webhook_url.txt is empty")
    return url


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=30)


def send_card(webhook_url, label, color, description, resolved=False):
    title = f"[RESOLVED] {label}" if resolved else f"[ALERT] {label}"
    card = {
        "type": "message",
        "attachments": [
            {
                "contentType": "application/vnd.microsoft.card.adaptive",
                "content": {
                    "type": "AdaptiveCard",
                    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                    "version": "1.4",
                    "body": [
                        {
                            "type": "TextBlock",
                            "text": title,
                            "weight": "Bolder",
                            "size": "Medium",
                            "color": color,
                            "wrap": True,
                        },
                        {
                            "type": "TextBlock",
                            "text": description,
                            "wrap": True,
                            "spacing": "Medium",
                        },
                        {
                            "type": "TextBlock",
                            "text": datetime.now(timezone.utc).strftime(
                                "%Y-%m-%d %H:%M:%S UTC"
                            ),
                            "isSubtle": True,
                            "size": "Small",
                            "spacing": "Small",
                        },
                    ],
                },
            }
        ],
    }
    data = json.dumps(card).encode("utf-8")
    req = urllib.request.Request(
        webhook_url, data=data, headers={"Content-Type": "application/json"}
    )
    try:
        urllib.request.urlopen(req, timeout=15)
    except Exception:
        # Nothing to log to (by design). Swallow so one bad send doesn't
        # crash the rest of this run's checks.
        pass


def alert(state, webhook_url, key, label, description):
    """Fire once per ongoing issue; skip if already active."""
    if key in state["active_alerts"]:
        return
    send_card(webhook_url, label, "Attention", description)
    state["active_alerts"][key] = datetime.now(timezone.utc).isoformat()


def clear_alert(state, webhook_url, key, label, description):
    if key not in state["active_alerts"]:
        return
    send_card(webhook_url, label, "Good", description, resolved=True)
    del state["active_alerts"][key]


def check_container(state, webhook_url):
    key = "container_down"
    result = run(["docker", "inspect", "-f", "{{.State.Running}}", CONTAINER_NAME])
    running = result.returncode == 0 and result.stdout.strip() == "true"
    if not running:
        alert(
            state,
            webhook_url,
            key,
            "Container Down",
            f"The Mosquitto broker container (`{CONTAINER_NAME}`) is not running "
            f"on **{HOST}**. Flow data is not being received or relayed while "
            f"this is down.\n\n"
            f"**To investigate:**\n"
            f"```\ndocker ps -a --filter name={CONTAINER_NAME}\n"
            f"docker logs --tail 50 {CONTAINER_NAME}\n```\n"
            f"**To restart:**\n```\ndocker start {CONTAINER_NAME}\n```\n"
            f"If it keeps exiting, check `docker logs {CONTAINER_NAME}` for the "
            f"crash reason before restarting again.",
        )
    else:
        clear_alert(
            state,
            webhook_url,
            key,
            "Container Down",
            f"The Mosquitto broker container (`{CONTAINER_NAME}`) on **{HOST}** "
            f"is running again.",
        )


def check_disk(state, webhook_url):
    result = run(["df", "-P"])
    if result.returncode != 0:
        return
    lines = result.stdout.strip().splitlines()[1:]
    seen_mounts = set()
    for line in lines:
        parts = line.split()
        if len(parts) < 6:
            continue
        filesystem, size, used, avail, pct, mount = parts[0], *parts[1:5], parts[5]
        if filesystem in ("tmpfs", "devtmpfs", "efivarfs") or mount.startswith(
            "/sys"
        ) or mount.startswith("/run") or mount.startswith("/boot/efi"):
            continue
        try:
            pct_num = int(pct.rstrip("%"))
        except ValueError:
            continue
        seen_mounts.add(mount)
        key = f"disk_{mount}"
        if pct_num > DISK_THRESHOLD_PCT:
            alert(
                state,
                webhook_url,
                key,
                "Disk Space Warning",
                f"Filesystem `{mount}` on **{HOST}** is at **{pct_num}%** used "
                f"(threshold is {DISK_THRESHOLD_PCT}%). If this fills up, "
                f"Mosquitto will not be able to persist its database and may "
                f"stop accepting data.\n\n"
                f"**To investigate what's using space:**\n"
                f"```\ndu -sh {mount}/* 2>/dev/null | sort -rh | head -20\n```\n"
                f"**Common cleanup targets:** old Docker images/logs "
                f"(`docker system df`, `docker system prune`), rotated log "
                f"files, stale exports in `/data`.",
            )
        else:
            clear_alert(
                state,
                webhook_url,
                key,
                "Disk Space Warning",
                f"Filesystem `{mount}` on **{HOST}** is back under "
                f"{DISK_THRESHOLD_PCT}% used ({pct_num}%).",
            )
    # Drop stale disk alert keys for mounts no longer seen.
    for key in list(state["active_alerts"].keys()):
        if key.startswith("disk_") and key[5:] not in seen_mounts:
            del state["active_alerts"][key]


def get_new_log_lines(state):
    since = state.get("last_check_iso")
    cmd = ["docker", "logs"]
    if since:
        cmd += ["--since", since]
    cmd += [CONTAINER_NAME]
    result = run(cmd)
    if result.returncode != 0:
        return []
    output = (result.stdout or "") + (result.stderr or "")
    return output.splitlines()


def check_logs(state, webhook_url):
    lines = get_new_log_lines(state)
    first_run = not state["first_run_done"]
    known = set(state["known_connections"])

    auth_fail_seen = False
    tls_error_seen = False

    for line in lines:
        # On the very first run there is no --since cutoff, so `lines` can
        # hold weeks of history. Use it only to seed the connection
        # baseline below -- don't raise auth/TLS alerts for old, already-
        # resolved events.
        if not first_run:
            if AUTH_FAIL_RE.search(line) and not TLS_BENIGN_RE.search(line):
                auth_fail_seen = True

            if TLS_ERROR_RE.search(line) and not TLS_BENIGN_RE.search(line):
                tls_error_seen = True

        m = CONNECT_RE.search(line)
        if m:
            ip = m.group("ip")
            username = m.group("username") or "(no username)"
            identity = f"{username}@{ip}"
            if identity not in known:
                known.add(identity)
                if first_run:
                    # Seed baseline silently on first run, no alert.
                    continue
                send_card(
                    webhook_url,
                    "Unknown Client Connection",
                    "Warning",
                    f"A client connected to Mosquitto on **{HOST}** that is "
                    f"**not** in the known-connections baseline.\n\n"
                    f"- Username: `{username}`\n"
                    f"- Source IP: `{ip}`\n\n"
                    f"**To investigate:**\n"
                    f"```\ndocker logs {CONTAINER_NAME} | grep '{ip}'\n```\n"
                    f"If this is expected (new sensor, dashboard, or "
                    f"integration), no action needed -- it will now be "
                    f"treated as known. If unexpected, consider rotating "
                    f"credentials for that username and checking "
                    f"`/mosquitto/config/passwd` and ACLs on the broker.",
                )

    state["known_connections"] = sorted(known)

    key = "auth_failure"
    if auth_fail_seen:
        alert(
            state,
            webhook_url,
            key,
            "Authorization Failure",
            f"Mosquitto on **{HOST}** logged one or more failed authorization "
            f"attempts in the last minute.\n\n"
            f"**To investigate:**\n"
            f"```\ndocker logs --since 5m {CONTAINER_NAME} | grep -i 'not authorised'\n```\n"
            f"Check the client's credentials and ACL entries in the "
            f"Mosquitto config/passwd file. Repeated failures from the same "
            f"IP may indicate a misconfigured client or a credential-guessing "
            f"attempt.",
        )
    else:
        clear_alert(
            state,
            webhook_url,
            key,
            "Authorization Failure",
            f"No new authorization failures on **{HOST}** in the last check.",
        )

    key = "tls_error"
    if tls_error_seen:
        alert(
            state,
            webhook_url,
            key,
            "TLS Handshake Error",
            f"Mosquitto on **{HOST}** logged a TLS/SSL handshake error in "
            f"the last minute (port 8883).\n\n"
            f"**To investigate:**\n"
            f"```\ndocker logs --since 5m {CONTAINER_NAME} | grep -iE 'tls|ssl|openssl'\n```\n"
            f"Common causes: an expired or mismatched certificate, a client "
            f"using an unsupported TLS version/cipher, or clock drift "
            f"between client and broker. Check cert expiry with:\n"
            f"```\nopenssl x509 -enddate -noout -in <path-to-cert>.pem\n```",
        )
    else:
        clear_alert(
            state,
            webhook_url,
            key,
            "TLS Handshake Error",
            f"No new TLS handshake errors on **{HOST}** in the last check.",
        )

    state["first_run_done"] = True


def main():
    webhook_url = read_webhook_url()
    state = load_state()

    check_container(state, webhook_url)
    # Only bother with log-based checks if the container is actually up.
    result = run(["docker", "inspect", "-f", "{{.State.Running}}", CONTAINER_NAME])
    if result.returncode == 0 and result.stdout.strip() == "true":
        check_logs(state, webhook_url)
    check_disk(state, webhook_url)

    state["last_check_iso"] = datetime.now(timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    save_state(state)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        # By design: no log file. If something in the watcher itself breaks,
        # fail silently rather than writing to disk; systemd journal (not a
        # file we manage) will still have stderr if you ever need to check
        # `journalctl -u mosquitto-watcher`.
        sys.exit(1)
