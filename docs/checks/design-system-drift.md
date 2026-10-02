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

There are six kinds:

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
6. [Words](#6-words): three ASCII dots where R10 writes the ellipsis character.

"The app" below is `apps/convergence/src/**/*.{ts,tsx}`. Tests (`*.test.{ts,tsx}`) are left out
everywhere, since a test may name a pattern to check it's gone; stories are not, since they're
what people see in Storybook. Backpack Studio is left out on purpose: its design system is
Backpack (MAR-2705).

## 1. Tokens and motion

`regex` rules over the app and `packages/ui/src`, but not `packages/ui/src/styles/**`, where the
tokens and their TypeScript mirrors are written.

| Rule                  | Fails on                                                                                                                                                                                                                                                                                                                       | Use instead                                                                                                                                                                                                                                                                                | Audit      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| `no-magic-values`     | an arbitrary value on a sizing, spacing, type, colour, border, shadow, layering, outline or motion utility: `w-[37px]`, `text-[11px]`, `grid-cols-[1fr_auto]`, `bg-[#0b0b0f]`; an arbitrary viewport breakpoint, `min-[860px]:` or `max-[…]:` (DS6)                                                                            | the token's utility (`text-2xs`, `w-side-panel`, `bg-terminal-bg`), or a new token in `tokens.css` and `theme.css`; a custom property is `w-(--name)`, never `w-[var(--name)]`; a breakpoint is Tailwind's (`md:`, `lg:`) or a `--breakpoint-*` of a theme (`learn-loom:`)                 | DS-20      |
| `no-raw-colors`       | a hex colour, or `rgb(`, `rgba(`, `hsl(`, `hsla(`, `oklch(`, `oklab(`, `lab(` or `lch(` with a value, in `.ts`, `.tsx` or `.css`                                                                                                                                                                                               | a colour token (`bg-surface`, `text-danger-ink`, `var(--line)`); code that can't read CSS takes a mirror from `@convergence/ui`, as xterm takes `terminalTokens`                                                                                                                           | DS-26      |
| `no-palette-colors`   | a Tailwind palette class: `text-`, `bg-`, `border-` (and its sides), `ring-`, `fill-`, `stroke-`, `from-`, `to-`, `via-`, `outline-`, `decoration-`, `divide-` or `shadow-` with `slate` … `rose` and a shade                                                                                                                  | a tone (R1): `text-<tone>-ink`, `bg-<tone>-soft`, `border-<tone>-line`, `bg-<tone>-solid` for `neutral`, `info`, `success`, `warning` and `danger`, or the `tone` of Badge, StatusPill, StatusDot and Notice; a named category is a hue token (`merged`, `crew-*`, `provider-*`, `tag-*`)  | DS-1       |
| `no-dark-variant`     | a `dark:` class, in the app only                                                                                                                                                                                                                                                                                               | the colour fixed in its token: every token is `light-dark(LIGHT, DARK)`, so a utility is right in both themes by itself. `dark:` belongs inside `@convergence/ui` (`packages/ui/AGENTS.md`)                                                                                                | DS-1, DS-2 |
| `no-white-overlays`   | `border-white/`, `bg-white/`, `ring-white/`, `divide-white/` and their `black` twins, in the app only                                                                                                                                                                                                                          | the theme-safe tokens: `border-line-soft` for a hairline, `bg-fill-hover` and `bg-fill-selected` for the hover and chosen fills, `bg-fill-quiet` for a faint panel, `bg-chip` for a chip                                                                                                   | DS-2       |
| `no-streamdown-names` | a name `theme.css` keeps painting for Streamdown's bundle alone, on any colour utility, with any variant or opacity: `bg-background`, `text-foreground`, `bg-muted`, `text-muted-foreground`, `border-border`, `bg-sidebar`, `bg-primary`, `text-primary-foreground`, `bg-black`; or its custom property, `var(--color-muted)` | the token the DS5 codemod moved each one to: `canvas`, `ink`, `surface-muted`, `ink-muted`, `line` (`line-soft` for `border-border/60` to `/80`), `surface-sunken`, `strong`, `on-strong`; black is `viewer` behind a picture and `scrim` behind a dialog                                  | MAR-3618   |
| `motion-from-tokens`  | `duration-150`, `delay-75`, `transition-all`; and in a stylesheet too (`.css`, DS6), an `animation` or `transition` (or its `-duration`, `-delay`, `-timing-function`) with a time or an easing typed out: `600ms`, `ease-out`, `cubic-bezier(…)`                                                                              | `duration-exit`, `duration-fast`, `duration-panel`, `duration-slow` (a bare `transition` is already `duration-fast`), and a transition that names what moves: `transition-colors`, `transition-opacity`, `transition-transform`; in CSS, `var(--motion-pulse)`, `var(--motion-ease-enter)` | DS-33      |

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

A breakpoint can't be a token's `var()`, since a media query doesn't read custom properties, so a
breakpoint Tailwind doesn't name is a `--breakpoint-*` in a theme block: Learn Loom's two-column
point is `--breakpoint-learn-loom: 53.75rem` in the app's `global.css`, worn as `learn-loom:`. The
breakpoint branch reads viewport breakpoints only: an arbitrary container query (`@min-[56rem]:`,
the Actions button's placement in `conversation-actions.styles.ts`) is a container size, which
the placement test reads by its number, and is left for the sweep that names container sizes.

`motion-from-tokens` reads the app's stylesheets as well as its code (DS6): `global.css` had typed
the notifications pulse's `600ms ease-out` and the working card's `ease-in-out` where the tokens
say the same, and a class rule can't see a stylesheet. The tokens' own files
(`packages/ui/src/styles/**`) are out of its reach, as for every token rule.

A transition that names what moves is a utility too: `transition-[width]` is an arbitrary value,
which `no-magic-values` reports. Besides Tailwind's `transition-colors`, `transition-opacity` and
`transition-transform`, the theme names three sets (`theme.css`, DS4): `transition-motion` (opacity,
scale and translate: a popup, a dialog or a sheet coming and going), `transition-size` (height,
width and opacity: a panel growing open) and `transition-fill` (width and the stroke's dash: a
meter's reading). A value that is a CSS keyword rather than a size (`gap: inherit`) goes in
`style`, as Button's busy label does.

`no-streamdown-names` reads the app and all of `packages/ui/src` except one file. DS5 removed the
legacy bridge that kept shadcn's names painting, but Streamdown's bundle (which `global.css` scans
with `@source`) still writes some of them, so `theme.css` ends in a vendor bridge that serves those
names, and only those: `background`, `foreground`, `muted`, `muted-foreground`, `border`,
`sidebar`, `primary`, `primary-foreground` and `black`. They still compile, so without the rule a
feature could write them again. The rule's one exclusion is `packages/ui/src/styles/theme.css`,
where the vendor bridge defines them (`--color-background: var(--canvas)` and the rest). The
mapping in its message is the DS5 codemod's table
(`packages/ui/tools/codemods/ds5-legacy-names.mjs`). Streamdown's palette shades (`text-red-600`,
`bg-red-50` for Mermaid's error box) are `no-palette-colors`' already, and in the app a
`bg-black/10` trips `no-white-overlays` as well as this rule.

## 2. Parts own their jobs

`regex` rules over the app, where a hand-built copy drifts. (`no-invisible-focus-ring` reads
`packages/ui/src` too: an invisible ring is a bug wherever it's typed.)

| Rule                        | Fails on                                                                                                                                                                                                                                                        | Use instead                                                                                                                                                                                                                                             | Audit         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `use-focus-ring`            | a ring typed by hand: `focus-visible:outline-focus`, `focus-visible:ring-focus`, the names before DS5 (`ring-ring`, `outline-ring`), each also behind `focus:`, `focus-within:` or `has-focus-visible:`, or a bare `focus-visible:outline`                      | `focusRing`, `focusRingInset`, `focusRingField`, `focusRingWithin` from `@convergence/ui`, which pick the ring by where the element sits; Button, IconButton, Input and TextLink have theirs                                                            | DS-7          |
| `no-invisible-focus-ring`   | one string with `outline-none` and `focus-visible:outline-…` but no `focus-visible:outline-solid`: in Tailwind 4 that ring draws nothing (MAR-3588)                                                                                                             | the same                                                                                                                                                                                                                                                | DS-7          |
| `use-spinner`               | `animate-spin`                                                                                                                                                                                                                                                  | Button's `pending` (with `pendingLabel`), or `Spinner`: both run on the motion tokens and stand still under reduced motion                                                                                                                              | DS-12         |
| `use-form-error`            | `<p … role="alert"`                                                                                                                                                                                                                                             | `FormError` (`FieldError` in a `Field`, DS3c)                                                                                                                                                                                                           | DS-5, DS-13   |
| `no-title-on-buttons`       | `title=` on a `<button>`, `<Button>` or `<IconButton>`                                                                                                                                                                                                          | IconButton's `label`, which is its accessible name and its tooltip, or `<Tooltip label>` (R2)                                                                                                                                                           | DS-3          |
| `use-button-sizes`          | `h-…`, `w-…` or `size-…` with a number in a `<Button>`'s or `<IconButton>`'s `className`; there also a text size, a padding, a min/max height or a height token, and `[&_button]:` resizing every button in a box                                               | a `size`: `xs`, `sm`, `md` or `lg`, 24, 28, 32 and 36 px (R3)                                                                                                                                                                                           | DS-4          |
| `no-native-confirm`         | `window.confirm(` or `globalThis.confirm(`                                                                                                                                                                                                                      | `ConfirmDialog` or `useConfirm` (DS3b), `variant="danger"` when the action destroys something: the focus starts on Cancel (R5)                                                                                                                          | DS-6          |
| `use-timestamp`             | a time written by hand: `Intl.DateTimeFormat`, `Intl.RelativeTimeFormat`, `toLocaleDateString(`, `toLocaleTimeString(`, a Date's own `toLocaleString(`, or `toLocaleString(` with a date's parts in its options                                                 | `<Timestamp>` (`relative`, `clock`, `date`, `datetime`, `log`): a `<time>`, the whole moment in our Tooltip; `formatTimestamp` where it must be a string                                                                                                | CONV-22       |
| `no-native-title`           | `title=` on any lowercase JSX element (`title=""` is no hint) or an SVG `<title>`, in the app and `packages/ui/src`                                                                                                                                             | `<Tooltip label>` (`when="truncated"` for text cut short); an icon-only button is an IconButton, whose `label` is its tooltip (R2)                                                                                                                      | NAV-20        |
| `no-buttons-as-rows`        | `h-auto` in a `<Button>`'s or `<IconButton>`'s `className`: a button stretched so more lines fit, as a row or a card                                                                                                                                            | `ListRow` for a row, `Card` with a `CardAction` for a box that opens, `ChoiceCard` for an option with a sentence, a link Button for words                                                                                                               | DS-21         |
| `use-notify`                | an import of `sonner` (its `toast`, its `Toaster`, or a type) anywhere in the app, tests too                                                                                                                                                                    | `notify` from `@convergence/ui`: `notify.failure("update Codex", error)` reads "Couldn’t update Codex." with the reason under it (R10); `toast` for the rest                                                                                            | DS-8          |
| `use-section-label`         | a hand-typed eyebrow: `uppercase` and a `tracking-…` utility in one class string (a `className`, an argument to `cn`, a `*.styles.ts` constant), in the app                                                                                                     | `SectionLabel` (`size="sm"` for the 10 px step, `as="h3"` when it names a section), or `sectionLabel` / `sectionLabelVariants({ size })` where the element can't be one                                                                                 | DS-20         |
| `use-badge-caps`            | `uppercase` in a `<Badge>`'s `className`                                                                                                                                                                                                                        | Badge's `caps`: one look for a kind or a short state in capitals                                                                                                                                                                                        | DLG           |
| `no-inline-drag-region`     | a window drag region written by hand, in the app or `packages/ui/src`: `WebkitAppRegion` (an inline style), `data-app-region`, or `-webkit-app-region:` in a style string                                                                                       | the theme's classes, `app-drag` on a strip and `app-no-drag` on what sits on it, or `ScreenHeader` and `DragRegion`, which own the drag; every part and popup carries `app-no-drag` itself                                                              | DS-19, NAV-11 |
| `no-removed-libraries`      | an import (types too) of a library DS1–DS5 removed, anywhere in `apps/*/src` or `packages/*/src`: `@radix-ui/*`, `radix-ui`, `cmdk`, `motion`, `framer-motion` (a `forbidden-import` rule)                                                                      | `@convergence/ui`'s part (Base UI underneath); Combobox and Listbox for a command list; CSS on the motion tokens, or a primitive in `packages/ui/src/motion`                                                                                            | DS-30         |
| `focus-colour-is-for-focus` | the focus colour on something that isn't focus: `outline-focus`, `ring-focus`, `border-focus` (or `bg-`, `text-` … `-focus`) with no `focus`, `focus-visible`, `focus-within` or `has-focus-visible` variant before it, in the app (an open Hail, a picked row) | R7's looks: chosen is the raised chip (a pressed Toggle, SegmentedControl, a Combobox's `chosen`), selected is the fill and `aria-current` (Card's or ListRow's `selected`), and a mark of its own is the chosen chip's edge, `outline-hairline-strong` | DS-28         |

A regex reads text, not code, so it sees only what's written where it looks: a size override kept
in a `*.styles.ts` constant passes `use-button-sizes`, and `repeated-classes` is what catches that
constant's third copy. The JSX patterns span lines inside a tag (`(?:[^>]|=>)*?` is "the rest of
the tag, past arrow functions"), so attribute order and line breaks don't matter. A utility behind
a variant (`[&_svg]:size-4`, the size of the icon inside) is not the button's size, and doesn't
count. Every regex rule skips a line that starts with a comment (`//`, `*`, `/*` or `{/*`), so a doc
comment may name the recipe it replaced.

`use-timestamp` (DS6, MAR-3608) reads the app and `packages/ui/src`, but not
`packages/ui/src/components/timestamp/`, where Timestamp and its helpers (`formatTimestamp`,
`fullDateLabel`, `exactDateLabel`, `calendarDaysBefore`) write every time through Intl. It is as
precise as a regex can be about a type it can't see. `toLocaleDateString` and `toLocaleTimeString`
are always times, and so is `Intl.DateTimeFormat`. `toLocaleString` is a number's too (`1,234`), so
the rule reports it only where the text shows a date: called on `new Date(…)`, or with options that
name a date's parts (`month:`, `hour:`, `dateStyle:` …). A bare `when.toLocaleString()` on a Date
held in a variable reads exactly like a count's, and passes; review catches that one. A time built
from `getHours()` and `padStart` is not a call the rule can name either. Five formats cover the app:
`relative`, `clock` and `date`, `datetime`, and `log` (the transcript's "Today, 14:07:33"); `seconds`
writes a clock to the second, and `hour12: false` keeps Mission Control's and Loom's 24-hour clocks.

DS6 (MAR-3608) widened three of these after sweeping each to zero. `use-focus-ring` also fails on
`focus-visible:outline-none` (and its `focus:`, `focus-within:` and `has-focus-visible:` twins):
tailwind-merge puts it and a part's own `outline-solid` in one group, so a className that carries
it cancels the part's ring. A field inside a box that rings for it is `Input` or `Textarea`
`variant="bare"`, with `focusRingWithin` on the box. `use-button-sizes` reads a size the scale
doesn't name, typed over a `size`: a text size, a padding, a min or max height or a height token
(`size="sm" className="px-3 text-2xs"`, `min-h-10`), and `[&_button]:` raising every button in a
box. Two kinds are left out on purpose: a `variant="link"` Button, which has no box, so its words
may take the sentence's size; and a Button with `h-auto`, grown into a row, which
`no-buttons-as-rows` reports. `no-native-title` replaced the sidebar-only walk in
`sidebar-tooltip-sites.test.ts`: it reads every `.tsx` in the app and `packages/ui/src`, not only the
app, since the browser's hint is wrong wherever it's typed; a part's `title` prop (EmptyState's,
Notice's) is its words, so only a lowercase element counts.

`no-buttons-as-rows` (DS6, MAR-3608) is `use-button-sizes`' sibling, kept apart from it: `h-auto` is
not a size but the undoing of one, and it means a Button was made to hold more than a control's
line. Before it turned red, sixteen Buttons had it, and each became the part for what it was. Boxes
that open something are a `Card` with a `CardAction` that holds their lines: the Needs-you card,
History's runs, a conversation to add to a crew, the session intents, a choice request's answers,
the parallel-work marker and the activity filters' summary. The turn card is a Collapsible, its
files in the panel, and the work block a ListRow. The local tunnels' pill is a `StatusPillButton`. A
picture, two section titles and "New workspace" are link Buttons, which have no box to undo, and
"Forked from" is one line on the 28 px Button. Like `use-button-sizes`, it reads only the tag: an
`h-auto` kept in a `*.styles.ts` constant, or handed to a component that passes it on to a Button,
is out of its reach.

`focus-colour-is-for-focus` (DS8, ruling 11) is `use-focus-ring`'s other half: that rule reports
a ring typed for focus, this one the focus colour typed for anything else. The open Hail was
outlined in `outline-focus`, the colour R7 keeps for the keyboard; it now wears the chosen chip's
edge (`outline-hairline-strong`), and the two hand-drawn "current" rings became Card's `selected`.
A class counts when no variant before it names focus, so `data-pressed:ring-focus` is reported and
`focus-visible:outline-focus` is left to `use-focus-ring`; a word that only contains `focus`
(`text-focus-ring-words`) is not a utility. DS8 swept it to zero first, and it is an error from its
first day. Its canary is `features/hail-room/hail-card.styles.ts`.

`use-notify` is the one rule here that reads imports rather than text: a `forbidden-import` rule
(the type Chaperone's import rules use), so a comment or a string that names `sonner` is not an
import, and a type import counts too (`includeTypeImports`). Ruling 2 (2 Oct 2026) moved the
toasts onto the design system: `Toaster` draws each one on the popup surface with its kind in R1's
tones, and `notify` words a failure as R10 does, so a toast raised from `sonner` itself would skip
both. Tests count too, unlike the regex rules': a test mocks `notify` from `@convergence/ui`, and a
`vi.mock('sonner')` under it is not an import.

`use-section-label` reads one class string at a time, wherever it is written, so a constant handed
to an element is seen as well as a `className`; an eyebrow split across two strings is not. A
Badge's capitals are `caps`, which `use-badge-caps` asks for: it reads the Badge's tag past a glyph
handed in a prop (`icon={<CheckCircle2 />}`), whose `/>` would otherwise end it. Both came with
DS6's labels sweep (MAR-3608), which brought each to zero first; their canary is
`features/skill-tags/skill-tags.presentational.tsx`.

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

A raw `<label` counts too (DS6, DS-13 and DS-14): a label typed by hand ties nothing to its
control, so a hint or an error under it is never read out with it. The part is `FieldLabel` in a
`Field` (with `FieldDescription` and `FieldError`), or `ChoiceField` around a Switch or a
Checkbox. A `FieldLabel` needs its `Field`, so a label for a control a Field can't wrap stays
raw, with its reason above it: the fork dialog's instruction, whose composer below also holds the
model pickers, which a Field around it would name the same.

A raw `<pre` is the rule's since DS6 (MAR-3608): a block of preformatted text is CodeBlock's job,
scrolling inside itself and focusable while it does (CONV-32). Three keep theirs with a reason: a
run's live log, whose stdout and stderr each wear their own ink (CodeBlock takes one string), a
prompt shown in the body font as it was written, and the debug drawer's payloads, dozens to a page.

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

## 6. Words

`no-ascii-ellipsis`, a `regex` rule over the app and `packages/ui/src` (tests left out): three
ASCII dots typed in words, such as "Loading...", a placeholder's "Search options..." or a name cut
short with `+ '...'`. R10 writes the ellipsis character, `…` (U+2026), on busy labels,
placeholders, cut-short text and every item or button that opens a dialog or a confirmation.

It looks only where words are: three dots right after a letter, a digit, `)` or `}` (the end of a
template's `${…}`), or right after a quote or `>` (a string or JSX text that starts with them).
Code's spread (`...props`, `[...items]`, `{...rest}`) always follows a bracket, a comma or a space,
so it is never reported, and a comment line is skipped as in every regex rule. What it can't see is
review's: a space before the dots (`'Loading ...'`), and words that reach the screen from
`apps/convergence/electron` (an error's message), which the renderer's rules don't read. DS6 swept
21 to zero before it turned on, as an error (MAR-3608). Its canary is
`canaries/chaperone/apps/convergence/src/widgets/sidebar/rename-session.container.tsx`.

## Rules not ported, and why

- **`use-external-link-props`.** accent. has a props helper, `externalLinkProps(href)`, and the
  rule fails on a hand-written `rel`. Convergence has no such helper: its one place for a link
  that leaves the app is `TextLink`'s `external` prop, a part, and a rule naming a helper nobody
  can use would only teach people to ignore it. Of the 8 hand-written `rel`s in the app today, 7
  sit on a raw `<a>` that `raw-elements-need-a-reason` reports; the eighth is the Artifact link in
  `space-workboard`, drawn with `buttonVariants` as an icon button, which TextLink can't be. That
  link is the case for the helper: if the sweep wants it, `externalLinkProps` goes into
  `@convergence/ui` first, and the rule after it.
- **`no-cursor-pointer`, `no-tap-highlight-per-element`.** Not part of DS4's brief. The cursor is
  DS5's base layer's job (DS-35), and Convergence is a desktop app with no tap highlight.
  (`use-timestamp` was in this list until DS6 ported it, as hand-formatted times rather than
  accent.'s `<time title>`: see section 2.)

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
`"severity"` to `"error"`. Each canary still proves its rule fires (`npm run canaries`). `no-streamdown-names` came after
(DS5c) and was an error from its first day: by then nothing outside `theme.css` wrote a
Streamdown name. DS6 (MAR-3608) swept each straggler first and added its rule at error the same
way: `no-inline-drag-region` and `no-removed-libraries` are new, `no-magic-values` reads arbitrary
breakpoints and `motion-from-tokens` reads stylesheets, each with a canary that goes silent when
its new pattern is taken out.

| Rule                         | Where it's set                  | Severity |
| ---------------------------- | ------------------------------- | -------- |
| `no-magic-values`            | `design-system-drift.json`      | error    |
| `no-raw-colors`              | `design-system-drift.json`      | error    |
| `no-palette-colors`          | `design-system-drift.json`      | error    |
| `no-dark-variant`            | `design-system-drift.json`      | error    |
| `no-white-overlays`          | `design-system-drift.json`      | error    |
| `no-streamdown-names`        | `design-system-drift.json`      | error    |
| `motion-from-tokens`         | `design-system-drift.json`      | error    |
| `use-focus-ring`             | `design-system-drift.json`      | error    |
| `no-invisible-focus-ring`    | `design-system-drift.json`      | error    |
| `use-spinner`                | `design-system-drift.json`      | error    |
| `use-form-error`             | `design-system-drift.json`      | error    |
| `no-title-on-buttons`        | `design-system-drift.json`      | error    |
| `use-button-sizes`           | `design-system-drift.json`      | error    |
| `no-native-confirm`          | `design-system-drift.json`      | error    |
| `no-inline-drag-region`      | `design-system-drift.json`      | error    |
| `no-removed-libraries`       | `design-system-drift.json`      | error    |
| `raw-elements-need-a-reason` | `design-system-drift.json`      | error    |
| `ui-components-have-stories` | `design-system-drift.json`      | error    |
| `app-parts-have-stories`     | `design-system-drift.json`      | error    |
| `stories-titled-by-group`    | `design-system-drift.json`      | error    |
| `stories-fail-on-axe`        | `design-system-drift.json`      | error    |
| `use-notify`                 | `design-system-drift.json`      | error    |
| `no-ascii-ellipsis`          | `design-system-drift.json`      | error    |
| `repeated-classes-guard`     | `.chaperone.json` (a `command`) | error    |
| `copied-code-guard`          | `.chaperone.json` (a `command`) | error    |
| `use-timestamp`              | `design-system-drift.json`      | error    |
| `no-native-title`            | `design-system-drift.json`      | error    |
| `no-buttons-as-rows`         | `design-system-drift.json`      | error    |
| `use-section-label`          | `design-system-drift.json`      | error    |
| `use-badge-caps`             | `design-system-drift.json`      | error    |
| `focus-colour-is-for-focus`  | `design-system-drift.json`      | error    |

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
