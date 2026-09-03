# Clearing Stale Retained MQTT Topics

## Why this is needed

Mosquitto (and MQTT brokers generally) support **retained messages**: when a
publisher sends a message with the `retain` flag set, the broker keeps the
last payload for that exact topic and replays it to any client that
subscribes later — even if nothing has published to that topic in weeks.

That's normally useful (a new subscriber immediately sees the last known
state instead of waiting for the next update), but it becomes a problem when
a topic layout changes. Flow monitor data used to publish under
`flow_monitors/<site_number>/...`. It now publishes under
`flow_monitors/prod/<site_number>/...` and
`flow_monitors/data_channel_types/...`. Nothing ever told the broker to
forget the old topics, so their last retained payload — sometimes over a
week old — is still sitting there and still gets delivered to anything that
subscribes to `flow_monitors/#`, including MQTT Explorer. That's why the
sidebar shows old `flow_monitors/<site_number>` entries next to the current
`flow_monitors/prod/<site_number>` ones with much fresher data.

The app itself has no automatic expiry for this — it has no way to know a
retained message is "old" vs. "the current value of something that just
doesn't change often" — so old topics accumulate until someone clears them
by hand.

## How to clear them

The broker treats "delete this retained message" as: publish to that exact
topic with an **empty payload** and the **retain flag** set. There is no
bulk-delete command, so the cleanup script (`ops/clear_retained_topics.sh`
in this repo) does it in two passes:

1. Subscribes to `flow_monitors/#` and drains every retained message
   currently on the broker.
2. For each topic found, skips anything under the current layout
   (`flow_monitors/prod/` and `flow_monitors/data_channel_types/`), and
   republishes the rest with an empty retained payload to clear them.

### Prerequisites

- `mosquitto-clients` installed (`mosquitto_sub` / `mosquitto_pub`).
- The mutual-TLS client cert/key and CA cert for this broker. On
  `sv-dg-p00-mid` these live in `~/mosquitto-ca/` (`ca.crt`, `client.crt`,
  `client.key`). The broker listens on port `8883` (TLS).

### Running it

Copy `clear_retained_topics.sh` onto the broker host (or wherever has
network access to it), then:

```bash
chmod +x clear_retained_topics.sh

# 1. Dry run — lists what WOULD be cleared, changes nothing
./clear_retained_topics.sh --dry-run \
  -h sv-dg-p00-mid -p 8883 \
  --cafile ~/mosquitto-ca/ca.crt \
  --cert ~/mosquitto-ca/client.crt \
  --key ~/mosquitto-ca/client.key

# 2. Review the output, then run for real (same command, no --dry-run)
./clear_retained_topics.sh \
  -h sv-dg-p00-mid -p 8883 \
  --cafile ~/mosquitto-ca/ca.crt \
  --cert ~/mosquitto-ca/client.crt \
  --key ~/mosquitto-ca/client.key
```

Always run with `--dry-run` first and eyeball the list before doing the real
run. The script only ever touches topics under `flow_monitors/` and
explicitly skips `flow_monitors/prod/` and `flow_monitors/data_channel_types/`,
but a broker connection is a broker connection — check the dry-run output
before clearing.

## When to run this again

This is a one-time cleanup for the specific migration from
`flow_monitors/<site_number>` to `flow_monitors/prod/<site_number>` +
`flow_monitors/data_channel_types/...`. Run it again any time a topic layout
changes and old publishers stop writing to a subtree — update the
`KEEP_PREFIXES` list in `clear_retained_topics.sh` to match whatever the
*current* layout is at that time.

There is currently no automatic/scheduled cleanup — this is a manual,
on-demand script. If stale retained topics become a recurring problem (e.g.
every time a device or site is decommissioned), consider having whatever
process retires a site also publish an empty retained message to its old
topics as part of decommissioning, instead of relying on someone to run this
script after the fact.
