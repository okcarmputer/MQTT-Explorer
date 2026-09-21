# EXPLORER-001 / 002 / 005 — Explorer tab, dark mode, filter controls

---

## EXPLORER-002 — Global dark mode

**Status:** Done — 2026-09-04

### Cause

The app had two independent theme systems and the toggle only drove one.

- `index.tsx` switched the **MUI** theme (`lightTheme`/`darkTheme`) from
  `state.settings.theme`.
- `dashboard.css` declared `.cmom-dashboard` as a **fixed dark palette**, with a
  comment stating it "always renders dark regardless of OS color-scheme".

So flipping Dark Mode repainted MUI-styled regions (Explorer tree, dialogs,
inputs, selects) and left every dashboard surface dark — the "only some sides
are dark" symptom.

### Fix

- `index.tsx` mirrors the selected theme onto `<html>` as `data-cmom-theme` and
  sets `color-scheme`. Applied to `documentElement` rather than a React wrapper
  because MUI Portals (dialogs, menus) and the `body` background render outside
  the component tree and still have to match.
- `dashboard.css` gains a light set of **the same token names** under
  `:root[data-cmom-theme='light'] .cmom-dashboard`. Only tokens are redefined —
  no component rule knows about the theme, and nothing changes size or position,
  so toggling cannot shift layout.
- `.cmom-explorer-panel` gets explicit light values, since it is deliberately
  defined outside the `.cmom-dashboard` scope and cannot use the tokens.
- `body` background is set for both themes, which is what closes the light gaps.
- Dark remains the default, so the pre-effect first paint has no light flash.

The light accent is `#1a7f37`, darkened from dark mode's `#2ea043`: the lighter
green does not hold 4.5:1 against white for the selected segmented control's
white label.

- [x] Whole window follows the selected theme.
- [x] No isolated light regions.
- [x] Theme change causes no layout change (tokens only).
- [x] Theme persists via the existing settings mechanism (unchanged).
- [ ] Visual confirmation in both themes — **needs your eyes**.

---

## EXPLORER-005 — Modern filter controls

**Status:** Done — 2026-09-04

New `dashboard/widgets/Controls.tsx`:

- **`SegmentedControl`** — a real `role="radiogroup"` with roving tabindex:
  arrow keys move between options, Home/End jump to the ends, and only the
  selected option is a tab stop. A plain row of buttons takes focus but conveys
  nothing about the options being related or mutually exclusive, which is what
  the accessibility requirement is actually about.
- **`FilterField`** — token-styled text filter with a clear button.

Adopted in two places, replacing rather than adding:

- `SimpleDeviceGrid` — the bare `<input>` and native `<select>` for severity
  (the dated controls) now use `FilterField` and `SegmentedControl`.
- `TimeRangeToggle` — its inline-styled buttons now delegate to
  `SegmentedControl` with `dense`, so chart time ranges and page filters are one
  control with one set of states.

- [x] Consistent appearance across device types.
- [x] Clear selected/unselected, hover, and focus states.
- [x] Keyboard accessible.
- [x] Dark-mode aware (tokens throughout).
- [x] Responsive (field goes full-width under 720px).
- [ ] Visual confirmation — **needs your eyes**.

---

## EXPLORER-001 — Modernize the topic explorer

**Status:** Partly blocked — needs a decision from you

### What is already true

The Explorer tree is **already hierarchical** with working expand/collapse
(`components/Tree/TreeNode/`, with `TreeNodeSubnodes`). The ticket's "parent
nodes can expand/collapse, navigate deeper" requirements are satisfied by the
existing implementation, so this is a presentation change, not a rewrite.

### The conflict

The request asks for topic nodes styled as **cards/buttons**. That was already
tried and deliberately removed. From `Tree/TreeNode/styles.ts`:

> Selection/hover used to be a colored background box behind the node's text
> (border-radius + background-color on an inline-block). That box was visibly
> sizing itself wrong for its own text content in the dashboard's panel layout —
> text spilling out past its background — and wasn't worth chasing further, per
> explicit direction to just drop the box and keep selection/hover as plain text
> styling instead (bold + accent color), which can't ever visually mismatch its
> text.

A card *is* that box. Re-adding it re-opens the bug that direction closed, and
PROJECT_MEMORY's rule is not to silently reverse a documented decision.

There is also a related documented hazard in `ContentView.tsx`: Explorer
deliberately does **not** carry the `.cmom-dashboard` class, because that
class's typography cascade changed the font out from under the tree's
highlight boxes and caused the same spilling. Any card styling has to avoid
that cascade too.

### Options

1. **Fix the sizing properly, then add cards.** The original box broke because
   an inline element's background does not size to wrapped/`nowrap` text the way
   the layout assumed. A block/flex row per node with the label as a child sizes
   correctly. More work, but it delivers what was asked without reopening a bug.
2. **Card the rows, not the labels.** Style each node as a full-width row with
   hover/selection background, avoiding the fit-to-text problem entirely.
   Reads as a modern list; closest to the reference screenshot's table rows.
3. **Leave node styling alone** and only address payload presentation.

**Recommendation: option 2.** It gives the card/button affordance, avoids the
exact failure mode that got the box removed, and matches the reference image
(which shows full-width rows, not fitted chips).

### Payload presentation

Still to do, and independent of the above: payloads should be laid out
vertically with clear key/value separation. Not started — I did not want to
touch the Explorer's rendering path in the same pass as the theme change, so
the theme fix can be verified in isolation.

- [x] Topics displayed hierarchically (already true).
- [x] Parent topics expand/collapse (already true).
- [ ] Payloads vertical and easy to scan.
- [ ] Topic nodes as cards — **blocked on the decision above**.
- [x] Dark mode works (EXPLORER-002).
