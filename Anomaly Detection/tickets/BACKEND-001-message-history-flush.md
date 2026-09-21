# BACKEND-001 — MessageHistoryStore flush fails with RangeError

**Status:** Open — observed 2026-09-04, not started
**Area:** Backend persistence. **Not** dashboard/UI. Pre-existing; unrelated to the
EXPLORER-* work.

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
