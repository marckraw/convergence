# packages/ui: the design system

Read the root [`AGENTS.md`](../../AGENTS.md) first; this adds what is specific to `@convergence/ui`.

- Props in, events out. No app code, no app state, no `@/` imports, no Electron, no `window.electronAPI`.
- Tokens only: a colour, size, radius, shadow or duration comes from a token, never a one-off value.
  - `src/styles/tokens.css` holds every value. Each colour is `light-dark(LIGHT, DARK)`; only the `--terminal-*` family has one value (dark in both themes). `src/styles/theme.css` maps tokens onto Tailwind (`--color-canvas: var(--canvas)` makes `bg-canvas`), and its legacy bridge keeps the old shadcn names (`bg-background` …) painting until DS5.
  - The theme is `data-theme="light|dark"` on `<html>` (or a subtree), written by `applyTheme`; it sets `color-scheme`, which picks each token's half. `dark:` belongs inside this package only; app code writes tokens. Code that can't read CSS uses `useAppliedTheme()`.
  - To add a token: a literal in `light-dark()` (or `var(--other)` for the same role) with a comment saying what wears it; a `--color-<name>` (or `--shadow-`, `--text-` …) line in `theme.css`; its pairs in `apps/convergence/src/app/theme-contrast.pure.test.ts`; its swatch appears in `Foundations/Colors` by itself. A new utility name tailwind-merge can't know goes in `src/lib/cn.pure.ts`.
  - TypeScript mirrors (`src/motion/tokens.ts`, `src/styles/layout.tokens.ts`, `src/styles/terminal.tokens.ts`, `src/styles/chart.tokens.ts`) have tests that keep them equal to `tokens.css`; change both together.
- One folder per part, `src/components/<name>/<name>.tsx`; several parts in one file are fine (shadcn style). `cn` and style constants live in `src/lib/`.
- Named exports only. Apps import from `@convergence/ui`; `src/index.ts` re-exports each name one by one.
- The tokens themselves are shown in `src/foundations/`, titled `Foundations/<Name>` (Colors, Type, Radii, Shadows, Control heights, Motion).
- Every part has stories beside it (`<name>.stories.tsx`), titled `Primitives/<Name>`, named `Default`, `Dark`, `Long`, `Busy`, `Failed`, `Empty`, `Disabled`, `ReducedMotion` where they apply. Play functions assert roles and behaviour, not classes. `npm run test:stories` runs each one in Chromium with axe; an exception is per story, narrow, and marked `a11y-known:`.
- Before axe looks, the shared `afterEach` (`.storybook/preview.tsx`) moves the real pointer off the page, so a `:hover` is never checked by chance: Linux applies one under a resting pointer, macOS doesn't. A story that means to check a hover asserts it in its own play function.

## UI rules (Marcin, 1 Oct 2026)

The UI audit of 1 Oct (MAR-3614, 172 findings) found that most of what drifts has one cause: a
feature builds by hand what the design system already has, and the copies drift apart. These
rules are Marcin's decisions from it (Linear doc `a113eefc9c1d`). They hold in `apps/convergence`
as much as here, and win over anything older that disagrees. Where a regex can see a rule, a
drift check enforces it as an error (`docs/checks/design-system-drift.md`); the rest is review.

### The third time, it's a part

Duplicate on purpose up to twice; the third time, build it here with stories and use it from
here. A class string, a focus ring, a spinner and an error line are patterns too. A shared
constant (`textStack`, `dialogSplit`, a slice's `*.styles.ts`) is the small form of a part.
Chaperone checks it: a class string's third copy (`repeated-classes`) and a pasted block
(`copied-code`) fail, unless the allowlist says why the likeness is a coincidence.

### The thirteen rules

- **R0 · When copies disagree, the most common look wins**, unless a rule below says otherwise.
  Why: keeping today's look made the parts a refactor, not a redesign; a change of look is a
  rule's decision, and lands as a listed visible change.
- **R1 · Status colour is one of five tones**: neutral, info, success, warning, danger (`-ink`,
  `-soft`, `-line`, `-solid`, or a part's `tone`). Working is info, waiting on you warning,
  finished success, failed danger, unreachable warning with its own glyph. "Needs you" is never
  red; red is only failed and errored. A category (crew, provider, chart series, merged PR) is a
  named hue token. No palette classes, and no `dark:` outside this package. Why: one session
  state was painted three colours; a tone keeps its meaning only while it's the one way to say it.
- **R2 · An icon-only button is an IconButton with one `label`**, its accessible name and its
  Tooltip; never a native `title`. Truncated text gets our Tooltip too. An unavailable control
  stays focusable (`aria-disabled`) and gives its reason in its Tooltip. Why: the browser's title
  is slow, unstyled and never shows on focus (105 of them); one label keeps what a screen reader
  says and what the eye reads the same.
- **R3 · One size scale for every control**: `xs` 24, `sm` 28, `md` 32 (the default), `lg` 36 px.
  Icon buttons are 24 in rows, chips and toolbars, 28 in headers and panels. Size is a prop,
  never a className. Why: 264 Button heights were set by hand, and controls side by side line up
  only on one scale.
- **R4 · Small text is `text-2xs` (11 px) or `text-3xs` (10 px)**, today's two sizes, so nothing
  moves; an 11 px floor waits for the redesign. Why: 477 arbitrary `text-[10px]` and
  `text-[11px]` were these two sizes typed by hand.
- **R5 · Anything one click can't undo confirms in ConfirmDialog** (`useConfirm`,
  `variant="danger"`, the focus on Cancel): deleting a conversation, workspace, worktree, crew,
  recipe, connection, prompt, account or key; clearing a trail or alarms; archiving a Space.
  Never `window.confirm`. Reversible actions (archive, detach) don't ask. Red is only the
  destructive menu item and the confirming button, and a quiet red is a Button variant, never a
  className. Why: red warns only while it means one thing, and the system's box doesn't look or
  focus like Convergence.
- **R6 · A dialog's ending says whether anything is saved yet**: "Done" when changes save as you
  go, Cancel then Save when they don't, no footer on pick-and-go dialogs (FormDialog's `saves`).
  One model per dialog; Refresh lives in the header. Settings saves as you go, with one secondary
  Done. Why: 21 footers were retyped, and Settings' Done dropped other tabs' edits.
- **R7 · Chosen is the raised chip; selected is a fill.** In a one-of-a-few control
  (SegmentedControl, NavTabs, toggles) the chosen option is the raised chip on a muted track,
  never the focus ring's colour. A selected row is `fill-selected` plus `aria-current`, distinct
  from hover, which is half its strength (`fill-hover`). Why: "chosen" was drawn four ways, and
  the ring's colour means focus.
- **R8 · One opaque popup surface** (`popupSurface`, `--raised`) for menus, selects and popovers;
  glass (`--glass`) is only for tooltips. Why: five popup parts each wrote their own surface, glass
  was copied into five features, and a list of choices reads worse through glass.
- **R9 · Picking one of a few**: 2–4 short options, SegmentedControl; options that each need a
  sentence, ChoiceCards (a radio group); up to about 8 fixed options, Select; long or loaded
  lists (branches, models, projects), Combobox. Why: a segmented control shows every choice only
  while they fit, and a list that loads needs a search.
- **R10 · Words.** Sentence case for titles, labels and buttons. "…" (the character) on busy
  labels ("Saving…"), and on every item or button that opens a dialog or a confirmation. A
  failure reads "Couldn't <verb> <thing>." with the reason under it (FormError, Notice). Refusing
  an agent: "Deny" for a permission, "Decline" for a form or a link. A name is a constant in the
  feature that owns it. Why: the same states were worded many ways (27 busy labels swapped by
  hand), and "…" is how a control says more comes next.
- **R11 · A number from a design handoff maps to the nearest token** when it's built. A value with
  no token becomes a new token or a recorded exception; only an illustration's geometry stays
  numeric. Why: measured values typed as they came made sizes nothing else used.
- **R12 · The terminal stays dark in both themes**, on its own `--terminal-*` tokens (xterm reads
  `terminalTokens`), with a tab strip that matches it. Why: in light, the strip was a light band
  over a black terminal.

### Before you build a part

1. Search `src/index.ts` and Storybook (`npm run storybook`). Reuse, or give the part a variant
   here (with stories), before you build a new one.
2. Compose parts before creating one. Add a prop only for a real second use, and name it for what
   it means (`variant="danger"`), not how it looks. Four or more booleans, or props that only work
   together: split it into parts.
3. Tokens only: no hex, no palette class, no arbitrary value. A missing token is a line in
   `tokens.css`, its `theme.css` mapping and its contrast pairs, reviewed as one.
4. Base UI underneath, triggers through `render` (not `asChild`). A control takes `size` on R3's
   scale and sets `data-size`; its focus ring comes from `src/lib/focus-ring.styles.ts`; an
   interactive part and every popup layer carry `app-no-drag`. No `cursor-*`: the base layer
   sets the cursor.
5. Stories beside it: `Default` and `Dark`, then `Long`, `Busy`, `Failed`, `Empty`, `Disabled`
   and `ReducedMotion` where they apply. Play functions assert roles, names and behaviour, never
   classes.
6. Export the part and its `Props` type, name by name, from `src/index.ts`.
7. Look at it in Storybook in light, dark and reduced motion (the toolbars), then run the gates
   (root `AGENTS.md`), `npm run test:stories` and `npm run chaperone -- check` among them.

## Motion

Motion explains a change: where something came from, where it went, whether it worked. It never
blocks input, and the more often something happens, the less it moves. Durations and easings are
the motion tokens (`--motion-*` in `tokens.css`, mirrored for TypeScript in `src/motion/tokens.ts`);
never `duration-150`, `ease-[…]` or `transition-all`. A new kind of motion is a new primitive in
`src/motion/`, with stories that run with reduced motion too, never a one-off in a feature.

| For                                         | Use                                                                             | What moves                                                                                                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hover, focus, a colour                      | `transition-colors` (a bare `transition` is the same timing)                    | colours, in `duration-fast` (150 ms)                                                                                                                                                   |
| Anything pressed                            | Button and IconButton already; elsewhere `press`                                | 97% while held (CSS `:active`); reduced motion: nothing shrinks                                                                                                                        |
| Menus, selects, popovers, tooltips          | the parts here (`popupMotion`)                                                  | grow from 95% at the trigger and travel 8 px in from its side in `--motion-fast`, leave in `--motion-exit`; transitions on Base UI's first and last frames, so closing midway reverses |
| Dialogs and sheets                          | Dialog, FormDialog, ConfirmDialog, Sheet (`growMotion`, `fadeMotion`)           | the panel grows in place and fades; the scrim only fades                                                                                                                               |
| A surface that pops, outside Base UI        | `animate-pop-in`, `animate-pop-out`, `animate-slide-in-{top,bottom,left,right}` | the same pop: 95% and 8 px from its side in `--motion-fast`, out in `--motion-exit`                                                                                                    |
| Content that opens in place                 | `Collapsible`                                                                   | height from nothing and a fade, in `--motion-panel` (`transition-size`); the chevron turns a quarter                                                                                   |
| A box that travels or resizes               | `transition-layout` (Loom's shell, its sheets)                                  | size and place, its edge and fill with it                                                                                                                                              |
| A reading that changes                      | `Meter` (`transition-fill`)                                                     | a bar's width, a ring's dash                                                                                                                                                           |
| Something under way with nothing to measure | `Spinner`, or Button's `pending` with `pendingLabel`                            | one even turn every `--motion-loop` (1 s); reduced motion stands it still. `pending` sets `aria-busy` and keeps the width                                                              |
| A loading state                             | `useDelayedLoading(pending)`                                                    | shows after 300 ms, then stays at least 400 ms                                                                                                                                         |
| Something live, for as long as it lasts     | `StatusDot` with `pulse`                                                        | one beat every `--motion-blink` (2 s); reduced motion stands it still                                                                                                                  |
| A tooltip                                   | `Tooltip`, IconButton's `label`                                                 | shows once the pointer rests `--motion-tooltip-delay` (200 ms), with the popup motion                                                                                                  |

- **Tokens.** `--motion-exit` 100 ms, `--motion-fast` 150 ms, `--motion-panel` 200 ms,
  `--motion-slow` 350 ms (rare, guided moments), `--motion-pulse` 600 ms, `--motion-loop` 1 s,
  `--motion-blink` 2 s, `--motion-wire` 1.8 s and `--motion-breath` 2.8 s (Mission Control's lit
  wire and working card), `--motion-tooltip-delay` 200 ms; the easings `--motion-ease`, `-in`,
  `-move`, `-enter`, `-exit`, `-guide`, `-blink`; `--motion-shift` 8 px, `--motion-scale-from`
  0.95, `--motion-loops` infinite. In classes: `duration-exit|fast|panel|slow`,
  `ease-out|in|in-out|enter|exit|guide`, `transition-motion|size|fill|layout`,
  `animate-pop-in|pop-out|slide-in-*|spin|pulse`.
- **Reduced motion reduces; it doesn't remove.** Nothing travels or scales (`--motion-shift` 0,
  `--motion-scale-from` 1) and a loop stands still (`--motion-loops` 0), but durations stay, so
  fades keep saying that something changed. It follows the system setting, and
  `data-motion="reduced"` on `<html>` (Storybook's Motion toolbar) turns it on as well. Every
  animated part has a `ReducedMotion` story that checks what still moves.
- **Popups** animate with CSS transitions on Base UI's `data-starting-style` and
  `data-ending-style` (`src/motion/popup.styles.ts`), never keyframes, from the
  `--transform-origin` the Positioner sets. `.storybook/motion-testing.ts` has what a play
  function needs to act mid-animation (`arrived`, `settled`, `runningAnimations`).
