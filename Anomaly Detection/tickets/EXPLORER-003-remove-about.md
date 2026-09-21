# EXPLORER-003 — Remove About MQTT Explorer

**Status:** Done — 2026-09-04

## Objective

Remove all "About MQTT Explorer" functionality: buttons, menu entries,
components, dialogs, handlers, imports, state, and supporting dead code.

## What was removed

| File | Change |
| --- | --- |
| `app/src/components/AboutDialog.tsx` | Deleted |
| `app/src/components/AboutDialog.spec.ts` | Deleted |
| `app/src/components/App.tsx` | Dropped import, `<AboutDialog>` render, `aboutDialogVisible` prop and `mapStateToProps` entry |
| `app/src/actions/Global.ts` | Dropped `toggleAboutDialogVisibility` action creator |
| `app/src/reducers/Global.ts` | Dropped `toggleAboutDialogVisibility` action type, `aboutDialogVisible` state field, initial value, and reducer case |
| `app/src/components/Sidebar/DetailsTab.tsx` | Dropped both About buttons (empty state + bottom), the `aboutSection` style, the now-unused `Info` and `Button` imports, and the now-unused `globalActions` prop/`mapDispatchToProps` wiring |

## Notes

- `AboutDialog.spec.ts` asserted the feature *exists* (author attribution, license
  text, the DetailsTab button). It could not survive the removal, so it was deleted
  with the feature. This intentionally drops 10 passing tests.
- `DetailsTab.tsx` had a **duplicate `aboutSection` key** in its style object
  (TS1117). Removing the feature removed that error too.

## Acceptance criteria

- [x] No "About MQTT Explorer" functionality remains — `grep -ri "about"` over
      `app/src` returns no matches for the feature.
- [x] No dead imports, state, actions, or styles left behind.
- [x] Touched files typecheck clean (verified by filtering `tsc --noEmit`).
- [x] No new test failures: 10 failing before, 10 failing after (all pre-existing).
