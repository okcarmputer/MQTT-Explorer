// Devices publish their own reading time inside the JSON payload under a
// variety of key names (not documented anywhere in this repo), so it's
// detected by name/shape rather than assumed to be one specific key —
// "Timezone" is excluded even though its name contains "time" since it's a
// zone descriptor, not a timestamp to parse. Shared by anything that needs
// to tell "when the device actually measured this" apart from "when this
// app last received/stored the message" (see PumpStationDetail.tsx's
// UnitStatus field rendering, and TopicPlot/TrendPanel's chart x-axis and
// "measurement" readout).
export function extractPayloadTimestamp(json: unknown): Date | undefined {
  if (!json || typeof json !== 'object') {
    return undefined
  }

  for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
    const keyLower = key.toLowerCase()
    if (keyLower === 'timezone') {
      continue
    }
    if (!keyLower.includes('timestamp') && !keyLower.includes('time') && !keyLower.includes('date')) {
      continue
    }

    if (typeof value === 'number') {
      const ms = value > 1e12 ? value : value * 1000 // seconds vs. ms epoch
      const date = new Date(ms)
      if (!Number.isNaN(date.getTime())) {
        return date
      }
    } else if (typeof value === 'string') {
      const date = new Date(normalizeToUtcIfNoOffset(value))
      if (!Number.isNaN(date.getTime())) {
        return date
      }
    }
  }

  return undefined
}

// An ISO-shaped date-TIME string with no trailing 'Z'/offset (e.g.
// "2026-08-27T14:36:52") is a UTC instant as far as these devices are
// concerned, but the JS/ECMA-262 date-time grammar treats a *missing*
// offset as the *local* zone, not UTC (unlike a bare date with no time
// component, which the spec already treats as UTC) — so `new Date(...)`
// on it silently reinterprets an already-correct UTC reading through
// whatever zone this app happens to be running in, e.g. showing "2:36 PM"
// on a viewer's afternoon when the true local time was still 10:36 AM.
// Appending "Z" ourselves whenever the string looks like ISO 8601 and
// genuinely carries no zone/offset of its own restores the intended UTC
// reading. Anything else (already has an offset, or isn't ISO-shaped at
// all) is left untouched.
function normalizeToUtcIfNoOffset(value: string): string {
  const trimmed = value.trim()
  const isoDateTimeNoOffset = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/
  return isoDateTimeNoOffset.test(trimmed) ? `${trimmed.replace(' ', 'T')}Z` : trimmed
}
