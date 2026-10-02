# Design-system drift checks

The UI audit of 1 Oct 2026 (its five areas: DS, CONV, NAV, MC and DLG) found that most of what
drifts in Convergence has one cause: a feature builds by hand what the design system already has.
A status is painted in a palette shade instead of a tone, a white hairline assumes a dark surface,
a spinner, an error line or a focus ring is typed out again, a Button is resized in `className`,
and a destructive action asks through the operating system's `window.confirm`. `@convergence/ui`
now has the tokens (DS2) and, slice by slice, the parts (DS3). These checks keep the app from
drifting away from them again: each one fires where a feature does by hand what the design system
does, and its message names the part or token to use instead.

The rules are plain Chaperone configuration, ported from accent.'s drift checks and changed to
Convergence's paths, parts and token names. They live in
[`apps/convergence/tools/chaperone/presets/design-system-drift.json`](../../apps/convergence/tools/chaperone/presets/design-system-drift.json),
which `.chaperone.json` extends, so they run in `npm run chaperone -- check`,
`npm run agent:pre-push` and CI. Each has a canary under `canaries/chaperone/`, a fixture that
breaks it on purpose, so a check that stops firing fails `npm run canaries` (MAR-3612).

Every rule is an **error** (DS5, MAR-3618): DS4's sweep brought each one to zero, area by area,
and then it turned red ([below](#severity-and-exceptions)). `npm run chaperone -- check` fails on
any of them, and so do `npm run agent:pre-push` and CI.

There are five kinds:

1. [Tokens and motion](#1-tokens-and-motion): a value or a colour typed by hand instead of a
   token.
2. [Parts own their jobs](#2-parts-own-their-jobs): a pattern that means "this was built by hand",
   with a message naming the part.
3. [Raw elements need a reason](#3-a-raw-element-needs-a-reason): a raw `<button>`, `<a>`,
   `<input>`, `<textarea>` or `<select>` in a presentational part says why it isn't the design
   system's.
4. [Every part has stories](#4-every-part-has-stories), under one of the seven Storybook groups,
   and every story fails on axe.
5. [Two guards](#5-the-third-copy-and-the-pasted-component): a class string's third copy, and a
   pasted component.

"The app" below is `apps/convergence/src/**/*.{ts,tsx}`. Tests (`*.test.{ts,tsx}`) are left out
everywhere, since a test may name a pattern to check it's gone; stories are not, since they're
what people see in Storybook. Backpack Studio is left out on purpose: its design system is
Backpack (MAR-2705).

## 1. Tokens and motion

`regex` rules over the app and `packages/ui/src`, but not `packages/ui/src/styles/**`, where the
tokens and their TypeScript mirrors are written.

| Rule                 | Fails on                                                                                                                                                                                                      | Use instead                                                                                                                                                                                                                                                                               | Audit      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `no-magic-values`    | an arbitrary value on a sizing, spacing, type, colour, border, shadow, layering, outline or motion utility: `w-[37px]`, `text-[11px]`, `grid-cols-[1fr_auto]`, `bg-[#0b0b0f]`                                 | the token's utility (`text-2xs`, `w-side-panel`, `bg-terminal-bg`), or a new token in `tokens.css` and `theme.css`; a custom property is `w-(--name)`, never `w-[var(--name)]`                                                                                                            | DS-20      |
| `no-raw-colors`      | a hex colour, or `rgb(`, `rgba(`, `hsl(`, `hsla(`, `oklch(`, `oklab(`, `lab(` or `lch(` with a value, in `.ts`, `.tsx` or `.css`                                                                              | a colour token (`bg-surface`, `text-danger-ink`, `var(--line)`); code that can't read CSS takes a mirror from `@convergence/ui`, as xterm takes `terminalTokens`                                                                                                                          | DS-26      |
| `no-palette-colors`  | a Tailwind palette class: `text-`, `bg-`, `border-` (and its sides), `ring-`, `fill-`, `stroke-`, `from-`, `to-`, `via-`, `outline-`, `decoration-`, `divide-` or `shadow-` with `slate` … `rose` and a shade | a tone (R1): `text-<tone>-ink`, `bg-<tone>-soft`, `border-<tone>-line`, `bg-<tone>-solid` for `neutral`, `info`, `success`, `warning` and `danger`, or the `tone` of Badge, StatusPill, StatusDot and Notice; a named category is a hue token (`merged`, `crew-*`, `provider-*`, `tag-*`) | DS-1       |
| `no-dark-variant`    | a `dark:` class, in the app only                                                                                                                                                                              | the colour fixed in its token: every token is `light-dark(LIGHT, DARK)`, so a utility is right in both themes by itself. `dark:` belongs inside `@convergence/ui` (`packages/ui/AGENTS.md`)                                                                                               | DS-1, DS-2 |
| `no-white-overlays`  | `border-white/`, `bg-white/`, `ring-white/`, `divide-white/` and their `black` twins, in the app only                                                                                                         | the theme-safe tokens: `border-line-soft` for a hairline, `bg-fill-hover` and `bg-fill-selected` for the hover and chosen fills, `bg-fill-quiet` for a faint panel, `bg-chip` for a chip                                                                                                  | DS-2       |
| `motion-from-tokens` | `duration-150`, `delay-75`, `transition-all`                                                                                                                                                                  | `duration-exit`, `duration-fast`, `duration-panel`, `duration-slow` (a bare `transition` is already `duration-fast`), and a transition that names what moves: `transition-colors`, `transition-opacity`, `transition-transform`                                                           | DS-33      |

`no-raw-colors` is narrower than accent.'s on purpose, so that it fires only on colours:

- A three- or four-digit hex needs a letter (`#fff`, `#0bf`) or one repeated digit (`#333`), so a
  pull request's number (`PR #915`, `#901 · running`) is not a colour. Six- and eight-digit hex
  always count.
- A colour function needs a value after its paren (a number, or `${`), so prose and error
  messages that name `oklch()` are not colours.
- Two story files are left out, each because it paints nothing of ours:
  `status-pill.stories.tsx` asserts the browser's computed "no fill" (`rgba(0, 0, 0, 0)`), and
  `attachment-preview.stories.tsx` holds an inline SVG picture standing in for a user's file.

The terminal needs no exclusion. xterm can't read CSS, so `@convergence/ui` exports
`terminalTokens` (`packages/ui/src/styles/terminal.tokens.ts`), a mirror of the `--terminal-*`
tokens that a test keeps equal to `tokens.css`; it sits under `src/styles`, out of the rule's
reach. The app's xterm theme (`features/terminal-pane/xterm-setup.pure.ts`) still writes the same
twenty hex values out again, and the sweep replaces them with `terminalTokens`.

A transition that names what moves is a utility too: `transition-[width]` is an arbitrary value,
which `no-magic-values` reports. Besides Tailwind's `transition-colors`, `transition-opacity` and
`transition-transform`, the theme names three sets (`theme.css`, DS4): `transition-motion` (opacity,
scale and translate: a popup, a dialog or a sheet coming and going), `transition-size` (height,
width and opacity: a panel growing open) and `transition-fill` (width and the stroke's dash: a
meter's reading). A value that is a CSS keyword rather than a size (`gap: inherit`) goes in
`style`, as Button's busy label does.

## 2. Parts own their jobs

`regex` rules over the app, where a hand-built copy drifts. (`no-invisible-focus-ring` reads
`packages/ui/src` too: an invisible ring is a bug wherever it's typed.)

| Rule                      | Fails on                                                                                                                                                                                                                                   | Use instead                                                                                                                                                                                  | Audit       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `use-focus-ring`          | a ring typed by hand: `focus-visible:outline-focus`, `focus-visible:ring-focus`, the names before DS5 (`ring-ring`, `outline-ring`), each also behind `focus:`, `focus-within:` or `has-focus-visible:`, or a bare `focus-visible:outline` | `focusRing`, `focusRingInset`, `focusRingField`, `focusRingWithin` from `@convergence/ui`, which pick the ring by where the element sits; Button, IconButton, Input and TextLink have theirs | DS-7        |
| `no-invisible-focus-ring` | one string with `outline-none` and `focus-visible:outline-…` but no `focus-visible:outline-solid`: in Tailwind 4 that ring draws nothing (MAR-3588)                                                                                        | the same                                                                                                                                                                                     | DS-7        |
| `use-spinner`             | `animate-spin`                                                                                                                                                                                                                             | Button's `pending` (with `pendingLabel`), or `Spinner`: both run on the motion tokens and stand still under reduced motion                                                                   | DS-12       |
| `use-form-error`          | `<p … role="alert"`                                                                                                                                                                                                                        | `FormError` (`FieldError` in a `Field`, DS3c)                                                                                                                                                | DS-5, DS-13 |
| `no-title-on-buttons`     | `title=` on a `<button>`, `<Button>` or `<IconButton>`                                                                                                                                                                                     | IconButton's `label`, which is its accessible name and its tooltip, or `<Tooltip label>` (R2)                                                                                                | DS-3        |
| `use-button-sizes`        | `h-…`, `w-…` or `size-…` with a number in a `<Button>`'s or `<IconButton>`'s `className`                                                                                                                                                   | a `size`: `xs`, `sm`, `md` or `lg`, 24, 28, 32 and 36 px (R3)                                                                                                                                | DS-4        |
| `no-native-confirm`       | `window.confirm(` or `globalThis.confirm(`                                                                                                                                                                                                 | `ConfirmDialog` or `useConfirm` (DS3b), `variant="danger"` when the action destroys something: the focus starts on Cancel (R5)                                                               | DS-6        |

A regex reads text, not code, so it sees only what's written where it looks: a size override kept
in a `*.styles.ts` constant passes `use-button-sizes`, and `repeated-classes` is what catches that
constant's third copy. The JSX patterns span lines inside a tag (`(?:[^>]|=>)*?` is "the rest of
the tag, past arrow functions"), so attribute order and line breaks don't matter. A utility behind
a variant (`[&_svg]:size-4`, the size of the icon inside) is not the button's size, and doesn't
count. Every regex rule skips a line that starts with a comment (`//`, `*`, `/*` or `{/*`), so a doc
comment may name the recipe it replaced.

## 3. A raw element needs a reason

`raw-elements-need-a-reason`, a `regex` rule on `apps/convergence/src/**/*.presentational.tsx`: a
raw `<button`, `<a`, `<input`, `<textarea` or `<select` fails unless the line above says why:

```tsx
{/* raw-element: the composer's field grows with its text, which Textarea doesn't */}
<textarea … />
```

or `// raw-element: <reason>` outside JSX. A comment with no reason (`{/* raw-element: */}`)
doesn't count, and an `eslint-disable-next-line` comment may sit between the reason and the
element. The design system has a part for nearly every control (Button, IconButton,
`buttonVariants` on a link, TextLink, ListRow, Input, Textarea, Select…), so a raw one is either a
part that should be used, or a deliberate exception, and the comment tells the next person which
(DS-27).

Two raw elements are the design system's already, and pass without a reason: one handed straight
to a part's `render` prop (`<ListRow render={<a href={url} />} …>`, Base UI's way of choosing the
element), and one drawn with `buttonVariants` (a link that looks like a button). The lookbehind
that reads the reason,
`(?<!(?://|/\*)[ \t]*raw-element:[ \t]*(?!\*/)\S[^\n]*\n(?:<eslint-disable line>)?[^\n]*)`, says
"not right after a line with a `raw-element:` comment that has a reason".

It replaced the two warnings that read presentational parts for `<button>` and `<input>` alone.
Containers keep theirs, `no-raw-button-outside-shared` and `no-raw-input-outside-shared`, which
take no reason: a container wires state, and a control it draws belongs in a presentational part
or the design system.

## 4. Every part has stories

Storybook is where the design system and the app's parts are seen, in both themes, and every story
runs as a test with axe (`npm run test:stories`). A part nobody can see there drifts unseen.

- `ui-components-have-stories` (`file-pairing`): every
  `packages/ui/src/components/<name>/<name>.tsx` and `packages/ui/src/motion/<name>/<name>.tsx`
  has `<name>.stories.tsx` beside it.
- `app-parts-have-stories` (`file-pairing`): every
  `apps/convergence/src/**/<name>.presentational.tsx` has `<name>.stories.tsx` beside it.
- `stories-titled-by-group` (`file-contract`): every `*.stories.tsx` in `apps/*/src` and
  `packages/*/src` has a meta `title` that starts with one of the seven groups, in the sidebar's
  order: Foundations, Primitives, Components, Motion, Entities, Features, Widgets.
- `stories-fail-on-axe` (`file-contract`): `packages/ui/.storybook/preview.tsx` keeps
  `a11y: { test: 'error' }`; `'todo'` or `'off'` would switch the accessibility gate off for every
  story at once.

**Sub-parts.** Some parts are only ever drawn inside a bigger one, and the bigger one's stories
show them: a panel's rows, a card's icon and status line, a dialog's filter button. A story of
their own would repeat the bigger one's. These are listed in `app-parts-have-stories`' `exclude`,
one line per folder:

```json
"apps/convergence/src/features/needs-you/{needs-you-card-icon,needs-you-card-status,needs-you-pr}.presentational.tsx"
```

Each listed part is imported by a stories file, directly or through the part that draws it
(`needs-you-card.stories.tsx` here). DS4 built the list by following the imports from every
stories file in the app, through containers and through each slice's `index.ts` for the names
imported from it. The list is the design, not a backlog: a new presentational part fails until it
has stories or is consciously listed as a sub-part, and a part with no stories anywhere is never
listed. Why not a folder-level rule ("a folder with a stories file is covered")? Because a
folder's stories don't show every part in it, and a folder rule would pass the one they miss.

## 5. The third copy, and the pasted component

Two guards in `scripts/guards`, run by Chaperone as `command` rules (MAR-3613), each with a canary
under `canaries/guards/`:

- `repeated-classes`: a class string of 4 or more utilities that appears more than twice in
  `apps/convergence/src` and `packages/ui/src` (tests and stories left out). The third copy is a
  `@convergence/ui` part, or a shared constant in the slice's `*.styles.ts`. Settings and the
  allowlist, each entry with a reason: `scripts/guards/repeated-classes.json`.
- `copied-code`: jscpd finds a pasted block of 100 tokens or more (`.jscpd.json`), renamed or
  not. Make the copy one shared part, or keep it on purpose in `scripts/guards/copied-code.json`
  with a reason.

Both are errors. When they turned red (DS5), `repeated-classes` had 13 strings past their second
copy. Three hid a part and now use one: `textStack` (exported from `@convergence/ui`), the flush
dialog's `dialogSplit` and `dialogRail`, and Mission Control's `INSPECTOR_CHOICE_CLASS`. The other
ten are layout sentences, not components (a glyph and words that may be cut short, a trailing
cluster, a wrapping row, a full-height column…), each allowlisted with that reason. `copied-code`
had one pasted block, the Parallel work panel's wiring in the session view and the chat surface,
which became one hook (`useParallelWorkPanel`, with `useAnswerInput` in the session entity). Its
allowlist keeps one entry: the two workspaces' jsdom test setups, which may not import each other.
An allowlist entry that stops matching is reported, so the lists stay true.

## Rules not ported, and why

- **`use-external-link-props`.** accent. has a props helper, `externalLinkProps(href)`, and the
  rule fails on a hand-written `rel`. Convergence has no such helper: its one place for a link
  that leaves the app is `TextLink`'s `external` prop, a part, and a rule naming a helper nobody
  can use would only teach people to ignore it. Of the 8 hand-written `rel`s in the app today, 7
  sit on a raw `<a>` that `raw-elements-need-a-reason` reports; the eighth is the Artifact link in
  `space-workboard`, drawn with `buttonVariants` as an icon button, which TextLink can't be. That
  link is the case for the helper: if the sweep wants it, `externalLinkProps` goes into
  `@convergence/ui` first, and the rule after it.
- **`use-timestamp`, `no-cursor-pointer`, `no-tap-highlight-per-element`.** Not part of DS4's
  brief. `Timestamp` exists (DS3d) and can take the first when the sweep wants it; the cursor is
  DS5's base layer's job (DS-35); and Convergence is a desktop app with no tap highlight.

## When one fires

- **A token rule:** use the token's utility. If no token fits, add one in
  `packages/ui/src/styles/tokens.css` (`light-dark()` for both themes, with a comment saying what
  wears it) and its line in `theme.css`, as `packages/ui/AGENTS.md` describes; never type the
  value again.
- **A part rule:** use the part its message names. If the part can't do what you need, give it the
  variant (in `packages/ui`, with stories) rather than typing the old recipe again.
- **A raw element:** use the part, or write the reason above it.
- **Stories:** add `<name>.stories.tsx` with the agreed story names (`Default`, `Dark`, `Long`,
  `Busy`, `Failed`, `Empty`, `Disabled`, `ReducedMotion`), or, for a sub-part drawn only inside a
  bigger part, list it in the rule's `exclude` and make sure the bigger part's stories show it.
- **`repeated-classes` or `copied-code`:** a part or a shared constant; an allowlist entry with a
  reason when the likeness is a coincidence.

## Severity and exceptions

A rule became an error only when it had nothing left to report, so that the day it turned red was
the day it couldn't be wrong: DS4 swept each area to zero against the baseline below, and DS5
(MAR-3618) re-measured with `npm run chaperone -- check --format json` and changed every
`"severity"` to `"error"`. Each canary still proves its rule fires (`npm run canaries`).

| Rule                         | Where it's set                  | Severity |
| ---------------------------- | ------------------------------- | -------- |
| `no-magic-values`            | `design-system-drift.json`      | error    |
| `no-raw-colors`              | `design-system-drift.json`      | error    |
| `no-palette-colors`          | `design-system-drift.json`      | error    |
| `no-dark-variant`            | `design-system-drift.json`      | error    |
| `no-white-overlays`          | `design-system-drift.json`      | error    |
| `motion-from-tokens`         | `design-system-drift.json`      | error    |
| `use-focus-ring`             | `design-system-drift.json`      | error    |
| `no-invisible-focus-ring`    | `design-system-drift.json`      | error    |
| `use-spinner`                | `design-system-drift.json`      | error    |
| `use-form-error`             | `design-system-drift.json`      | error    |
| `no-title-on-buttons`        | `design-system-drift.json`      | error    |
| `use-button-sizes`           | `design-system-drift.json`      | error    |
| `no-native-confirm`          | `design-system-drift.json`      | error    |
| `raw-elements-need-a-reason` | `design-system-drift.json`      | error    |
| `ui-components-have-stories` | `design-system-drift.json`      | error    |
| `app-parts-have-stories`     | `design-system-drift.json`      | error    |
| `stories-titled-by-group`    | `design-system-drift.json`      | error    |
| `stories-fail-on-axe`        | `design-system-drift.json`      | error    |
| `repeated-classes-guard`     | `.chaperone.json` (a `command`) | error    |
| `copied-code-guard`          | `.chaperone.json` (a `command`) | error    |

A rule is never relaxed to reach zero, and never turned back into a warning to let a change
through. When one fires, fix what it found ([When one fires](#when-one-fires)). When it can't be
right about something, propose an exception in the same pull request, in the narrowest form there
is, with its reason where the next reader will look:

- **One raw element:** `// raw-element: <reason>` (or `{/* raw-element: <reason> */}`) on the line
  above it.
- **An axe rule a story can't meet:** that one rule switched off in the stories'
  `parameters.a11y.config.rules`, with an `a11y-known: <reason>` comment above it (as the Pierre
  diff viewer's stories do); never `a11y.test` turned down, and never in the preview.
- **A sub-part with no stories of its own:** a line in `app-parts-have-stories`' `exclude`, for a
  part the bigger part's stories show ([section 4](#4-every-part-has-stories)).
- **A class string or a pasted block that is a coincidence:** an entry in
  `scripts/guards/repeated-classes.json` (`{ classes, reason }`) or
  `scripts/guards/copied-code.json` (`{ files: [a, b], reason }`). A stale entry is reported.
- **A file a token rule cannot be right about:** a line in the rule's `exclude` in
  `design-system-drift.json`, and its reason written in this document (as `no-raw-colors`' two
  stories are). Never a file nobody has fixed yet.

The reviewer weighs the reason; an exception without one doesn't merge.

## The baseline

What DS4 swept, kept as the record: drift warnings on master `cefbb5eb` (2 Oct 2026, after DS3c),
by rule and by the audit's areas. Every count is zero today.

- **DS:** `packages/ui` and the app's `shared/`.
- **CONV:** session-view, chat-surface, composer, response-annotations, conversation-actions,
  `context-*`, `session-*`, model-picker, provider-status.
- **NAV:** `app/`, sidebar, global-status-bar, workspace-layout, terminal-dock,
  project-actions-menu, command-center, theme-toggle, the toasts (notifications-toast-host,
  provider-updates-toast, updates-toast), feedback-button.
- **MC:** mission-control (widget and feature), waves, needs-you.
- **DLG:** the rest of the features, and session-debug-drawer.
- **entities:** `entities/`.

| Rule                         |     DS |    CONV |     NAV |      MC |     DLG | entities |    Total |
| ---------------------------- | -----: | ------: | ------: | ------: | ------: | -------: | -------: |
| `no-magic-values`            |     31 |     175 |      74 |     311 |     172 |       15 |      778 |
| `no-raw-colors`              |      · |       · |       6 |      30 |      36 |        · |       72 |
| `no-palette-colors`          |     13 |     151 |      34 |     113 |     175 |       12 |      498 |
| `no-dark-variant`            |      · |      19 |      11 |       4 |      35 |        4 |       73 |
| `no-white-overlays`          |      · |       4 |      14 |      99 |      15 |        · |      132 |
| `motion-from-tokens`         |      3 |       · |       1 |       2 |       · |        · |        6 |
| `use-focus-ring`             |      · |       4 |       1 |       6 |       · |        · |       11 |
| `no-invisible-focus-ring`    |      · |       · |       · |       · |       · |        · |        0 |
| `use-spinner`                |      2 |       9 |       3 |       4 |      14 |        2 |       34 |
| `use-form-error`             |      · |       8 |       · |       6 |       9 |        · |       23 |
| `no-title-on-buttons`        |      · |       · |       · |       · |       · |        · |        0 |
| `use-button-sizes`           |      · |       1 |       · |       5 |       1 |        1 |        8 |
| `no-native-confirm`          |      · |       2 |       6 |       · |       1 |        · |        9 |
| `raw-elements-need-a-reason` |      1 |       2 |       · |       8 |       1 |        · |       12 |
| `ui-components-have-stories` |      · |       · |       · |       · |       · |        · |        0 |
| `app-parts-have-stories`     |      1 |       · |       2 |       · |       2 |        · |        5 |
| `stories-titled-by-group`    |      · |       · |       · |       · |       · |        · |        0 |
| `stories-fail-on-axe`        |      · |       · |       · |       · |       · |        · |        0 |
| **Total**                    | **51** | **375** | **152** | **588** | **461** |   **34** | **1661** |

A regex rule counts every match, so a line with two arbitrary values is two warnings. The five
presentational parts with no stories anywhere: `features/app-settings/app-settings`,
`features/app-settings/execution-host-endpoints`, `shared/ui/file-status-icon` (imported by
nothing), `widgets/terminal-dock/leaf-pane` and `widgets/terminal-dock/split-node`.

To see an area's list: `npm run chaperone -- check --format json` and filter `results` by rule
and path.
