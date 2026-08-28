# CMOM dashboard — ownership boundary

This directory (`app/src/dashboard`) is the presentation layer for the
flow-monitor / pump-station dashboard. It is display-only: topic layout,
colors, gauges, tables, and panels. It does not compute anomaly severity,
baselines, or classification rules.

**All flow-monitoring and anomaly-detection logic lives in the
`Anomaly_Detection` repo** (`hachAPI/`, `flow_monitors/`, `pump_stations/`),
which:

- computes severity (flow channel z-scores, digital-input alarm
  classification, pump-station shadow-mode statistics), and
- publishes the result as retained MQTT topics this dashboard reads:
  - `flow_monitors/{site}/{channel_id}/anomaly` + `.../baseline`
  - `pump_stations/{serial}/DigitalInputs/DigitalInput{n}/anomaly`
  - `pump_stations/{serial}/AnalogInputs/AnalogInput{n}/anomaly` + `.../baseline`
  - `pump_stations/{serial}/PumpRuntimes/PumpRuntime{n}/anomaly` + `.../baseline`
  - `pump_stations/{serial}/RainInfo/anomaly` + `.../baseline`
  - `flow_monitors/manhole_info/{flowMeterId}` — manhole/flow-meter reference
    data (not a computed severity, but likewise owned there, not hardcoded
    here — see `flow_monitors/publish_manhole_info.py`)

See `Anomaly_Detection/DASHBOARD_INTEGRATION_INSTRUCTIONS.md` for the full
topic/payload reference.

## The rule

If a severity, threshold, or classification rule looks wrong, **the fix
goes in the Anomaly_Detection repo**, not here — e.g.
`flow_monitors/detector.py`'s z-score comparison or
`pump_stations/ps_mqtt.py`'s `classify_di_severity()`. `config.ts`'s
`severityFromPayload()` is the one place this app turns a published
`.../anomaly` payload into a display color; it does not re-derive severity
from raw sensor fields. If you find code here matching on `Alarm`/
`AlarmDescription`/threshold values to compute a severity instead of reading
a published `.../anomaly` topic, that's a bug — move the rule to
Anomaly_Detection and read the topic instead.

Reference/lookup data (manhole attributes, wet-well dimensions, port
geometry) follows the same rule: the anomaly-detection repo (or its SQL
Server, via `src/sqlReporting.ts`) is the source of truth; this app reads
it live rather than hardcoding a copy.
