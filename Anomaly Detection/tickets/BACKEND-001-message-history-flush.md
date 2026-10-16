# BACKEND-001 — MessageHistoryStore flush fails with RangeError

**Status:** Fixed 2026-09-24 in code — pending a long run against the live broker
(last acceptance criterion)
**Area:** Backend persistence. **Not** dashboard/UI. Pre-existing; unrelated to the
EXPLORER-* work.

## Resolution (2026-09-24)

**Correction to the analysis below:** the flush did succeed for a while. The
earlier scan only searched the repo; the Electron store lives in
`%APPDATA%\MQTT-Explorer\message-history.json`, which had reached **529 MB**
(31,791 topics, 1.3M points, Aug 20 13:29 – Aug 25 14:04). Every flush after
Aug 25 14:04 failed. On each launch the app loaded that frozen snapshot, so charts
showed a dense Aug 20–25 block and then only the current session's points,
which were lost on quit.

Size came from recording *every* topic (`$SYS`, DigitalInputs, PumpRuntimes,
UnitStatus, …) with full ~330-byte OPC-UA payloads. The 3,000-points-per-topic
cap bounded nothing in aggregate across 31k topics.

`MessageHistoryStore` was rewritten:

- **Only charted topics** are recorded: `…/AnalogInputs/AnalogInput<n>/ScaledValue`
  and `flow_monitors/[prod/]<site>/<channel>`, the only topics `TrendPanel`
  hydrates.
- **Payloads compacted** to the value field plus the one timestamp field
  `extractPayloadTimestamp` would pick (~60 bytes instead of ~330).
- **Identical re-deliveries skipped** (retained messages on reconnect, flow
  monitors re-publishing the same hourly reading).
- **Append-only daily files** `message-history/YYYY-MM-DD.ndjson`; each flush
  appends only new lines. **Retention: 30 days**, and expired files are deleted
  whole. At most 2,000 points per topic are held in memory (matches
  `TREND_HISTORY_ITEMS`).
- **Failure surfaced:** unwritten lines are retried (capped at 200k), and the error
  is returned on `getTopicHistory` as `storageError`. `TrendPanel` shows "Chart
  history isn't being saved".
- The 529 MB file was deleted. Its data was all older than the retention window.
- Tests: `backend/src/Model/spec/MessageHistoryStore.spec.ts`.

Long-term history of record belongs in SQL, not this local cache.

## Original analysis (2026-09-04)

## Symptom

While the app runs against the live broker, the Electron main process log fills with:

```
[MessageHistoryStore] flush failed: RangeError: Invalid string length
    at JSON.stringify (<anonymous>)
    at FileAsync.stringify [as serialize] (node_modules/lowdb/adapters/_stringify.js:5:15)
    at FileAsync.write (node_modules/lowdb/adapters/FileAsync.js:58:42)
    at MessageHistoryStore.flush (dist/backend/src/Model/MessageHistoryStore.js:71:47)
    at Timeout._onTimeout (dist/backend/src/Model/MessageHistoryStore.js:46:18)
```

40 occurrences within roughly a minute of running. It is on a timer
(`Timeout._onTimeout`), so it repeats indefinitely for the life of the process.

## Cause

`RangeError: Invalid string length` is V8 refusing to produce a string longer than
its hard maximum (~512 MB on 64-bit). It comes from `JSON.stringify`, called by
lowdb's `FileAsync` adapter.

lowdb serializes the **entire database to a single JSON string on every write**.
`MessageHistoryStore` accumulates broker message history in memory; against a live
broker publishing at this site's rate, the in-memory structure crosses V8's string
ceiling, and from that moment every subsequent flush throws.

Confirming detail: a filesystem scan for JSON/db files over 5 MB in the repo found
**nothing**. The flush has never succeeded, so the data never reaches disk — the
bloat is entirely in memory. This is not a corrupt or oversized file on disk that
could be cleared; it is an unbounded in-memory structure.

## Consequences

1. **Message history is not persisted at all.** Every flush fails, silently as far
   as the UI is concerned — the error only appears in the main process log.
2. **Unbounded memory growth.** Nothing trims the structure, so it grows for as
   long as the app runs.
3. **Wasted work on a timer.** Each tick attempts a >512 MB serialization and throws.

## Direction (not yet investigated in depth)

The root problem is architectural: whole-database-per-write serialization does not
suit an append-heavy, unbounded time series. Options, roughly in order of effort:

- **Bound the history.** Cap retained messages per topic (ring buffer) or by age,
  so the serialized size has a ceiling. Smallest change; likely sufficient.
- **Flush incrementally.** Append new messages rather than rewriting the whole DB.
- **Change store.** Move message history off lowdb to something built for appends
  (SQLite, or a line-delimited log).

Whichever is chosen, the flush should also **surface its failure** rather than only
logging — silent unbounded growth is what let this go unnoticed.

## Acceptance criteria

- [ ] Flush succeeds against the live broker and keeps succeeding over a long run.
- [ ] Memory does not grow without bound while connected.
- [ ] Retention behavior is explicit and documented.
- [ ] Flush failure is surfaced, not just logged.
- [ ] Verified by running `yarn build && yarn start` against the real broker and
      watching the main process log stay clean.

## Reproduction

```bash
yarn build
yarn start
```

Connect to the live broker, leave it running, watch the Electron main process log.
