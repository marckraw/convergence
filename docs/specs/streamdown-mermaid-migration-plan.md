# Streamdown + Mermaid Migration — Implementation Plan

Companion to `docs/specs/streamdown-mermaid-migration.md`. Sliced into six
phases. Each phase is independently shippable and verified before the next
begins. The four CLAUDE.md gates (`npm run typecheck`, `npm run test:pure`,
`npm run test:unit`, `chaperone check --fix`) plus `npm install` run at the
end of every phase.

**Branch:** `mermaid-support` (already current).

**Re-orient between phases.** Read the spec and this plan back at the start
of every phase. Tick the boxes you finish; do not skip ahead.

---

## Phase M0 — Spike: API surface, bundle impact, override mechanism

**Goal:** resolve the four open assumptions in the spec before changing any
production code. No `package.json` change yet — work in a throwaway scratch
file or sandbox project.

- [x] Read Streamdown's source (or its `dist/` ESM) to determine the
      component override mechanism.
- [x] Document findings in this plan under "Phase M0 findings" below.
- [x] Verify Streamdown can express two text-density variants (the
      `size: 'sm' | 'md'` API).
- [x] Confirm plugin packages (`@streamdown/mermaid`, `@streamdown/code`)
      and how they integrate with Streamdown core.
- [ ] Measure bundle delta — **deferred**: per user direction, budget is
      generous. Recorded as informational only after M2 lands so we have
      a real measurement against the migrated component, not a scratch
      install.
- [x] Confirm Streamdown's licence is compatible with the repo's licence.

**Phase M0 findings:**

- **Component override prop**: `components` — same shape as
  `react-markdown`'s. Type: `Components = { [Key in keyof JSX.IntrinsicElements]?: ComponentType<JSX.IntrinsicElements[Key] & ExtraProps> | keyof JSX.IntrinsicElements } & { inlineCode?: ComponentType<...>; [key: string]: ... }`.
  Migration is essentially a search-and-replace.
- **Compact-mode strategy**: same approach as today — pass different
  Tailwind classes from the override factory based on `size`. No API
  changes from Streamdown's side.
- **Plugin shape**: `@streamdown/mermaid` and `@streamdown/code` each
  export pre-configured plugin objects (`mermaid`, `code`) plus factory
  functions (`createMermaidPlugin`, `createCodePlugin`) for custom
  configuration. They are passed via the top-level `plugins` prop:
  `plugins={{ code, mermaid }}`.
- **Built-in feature flags discovered (saves us work)**:
  - `mermaid?: { config?: MermaidConfig; errorComponent?: ComponentType }`
    — direct prop on Streamdown for mermaid config (e.g. `securityLevel`).
  - `shikiTheme?: [ThemeInput, ThemeInput]` — direct prop, no need to
    configure via plugin factory in most cases.
  - `mode: 'static' | 'streaming'` — explicit streaming mode.
  - `isAnimating: boolean` — streaming animation state.
  - `parseIncompleteMarkdown: boolean` — incomplete-markdown handler
    (the streaming-correctness feature).
  - `controls?: ControlsConfig` — toggle copy/download/fullscreen for
    code, table, and mermaid blocks.
  - `linkSafety?: LinkSafetyConfig` — URL preview modal for outbound
    links.
  - `caret?: 'block' | 'circle'` — streaming caret indicator style.
  - `useIsCodeFenceIncomplete()` hook — exposed for callers who want to
    defer expensive renders until a code fence is closed.
- **CSS imports required**: `import "streamdown/styles.css"` (per
  README). Add to wherever the renderer's global CSS is imported (likely
  `src/app/global.css` via Tailwind, or the renderer entry).
- **Tailwind 4 `@source` directives confirmed**: one for streamdown
  itself plus one per installed `@streamdown/*` plugin, otherwise the
  utility classes get tree-shaken.
- **Repo CSS tokens**: `--background`, `--foreground`, `--muted`,
  `--muted-foreground`, `--border`, `--primary`, `--radius` are already
  defined in `src/app/global.css`. Streamdown's defaults align. No new
  tokens needed.
- **Licence**: repo is ISC; Streamdown is Apache-2.0. Fully compatible
  for an internal Electron app. NOTICE file aggregation is best
  practice but not blocking for V1; existing third-party-licence handling
  in the repo (if any) covers it.

**Decision**: PROCEED to M1. The discovery that `components` is a
direct port of react-markdown's API removes the largest perceived
risk. Migration mechanics are now well understood.

**Verification**: spike findings recorded above. No production files
changed.

---

## Phase M1 — Install dependencies, register Tailwind sources, smoke test

**Goal:** all packages present, build still works, dev still works. No
behavioural change yet.

- [x] `eval "$(fnm env)" && fnm use` (per memory: this machine has fnm,
      not nvm). Node v24.15.0 active.
- [x] `npm install --save streamdown @streamdown/mermaid @streamdown/code`
      — installed `streamdown@2.5.0`, `@streamdown/mermaid@1.0.2`,
      `@streamdown/code@1.1.1`.
- [x] Add Tailwind 4 `@source` directives plus `@import 'streamdown/styles.css';`
      to `src/app/global.css`. Path is `../../node_modules/...` (CSS file
      lives in `src/app/`, not in a monorepo root).
- [x] Verify the four gates: - `npm run typecheck` — clean - `npm run test:pure` — 1218 tests, all green - `npm run test:unit` — 452 tests, all green - `chaperone check --fix` — 0 errors, 0 warnings (407 files)
- [ ] Ask the user to run `npm run dev` and confirm the app still boots
      with no console errors. (Agents must not run `npm run dev` per
      CLAUDE.md.)

**Verification:** all four gates green; user confirms app boots.

---

## Phase M2 — Replace `react-markdown` internals with Streamdown (visual parity)

**Goal:** swap the renderer with no visible difference. Mermaid not yet
enabled. Cut-detector canary still active.

- [x] Rewrite `src/shared/ui/markdown.presentational.tsx` to render
      `<Streamdown>` instead of `<ReactMarkdown>`. Existing `components`
      override map ports verbatim — Streamdown's `Components` type
      matches react-markdown's. Removed the `remarkGfm` plugin import;
      Streamdown ships GFM by default.
- [x] Preserve the public API exactly: `MarkdownProps` shape, default
      `size = 'md'`, `cn(...)` wrapper div, `rootRef` forwarding all
      kept. No callers needed to change.
- [x] Add a new optional `isStreaming?: boolean` prop on `MarkdownProps`
      and forward it to Streamdown's `isAnimating`. Default `false`.
      No caller wired to it yet — that's M5.
- [x] Add component tests in
      `src/shared/ui/markdown.presentational.test.tsx` covering: sm/md
      paragraph spacing, inline code chrome, fenced code header,
      GFM tables in scroll wrapper, GFM strikethrough.
- [x] Verify the four gates: typecheck clean, 1218 pure tests green,
      452+6 unit tests green, chaperone 0/0 (408 files).
- [ ] Manual QA: ask the user to scroll through an existing session
      with mixed content (lists, tables, code, links) and confirm no
      visual change.

**Verification:** all four gates green; component tests cover the
elements above; user confirms visual parity.

---

## Phase M3 — Enable Mermaid plugin

**Goal:** mermaid blocks render as SVG with light/dark theme support.

- [x] Register `@streamdown/mermaid` in the Streamdown `plugins` prop in
      `markdown.presentational.tsx`. Plugin imported as
      `import { mermaid as mermaidPlugin } from '@streamdown/mermaid'`
      and passed as `plugins={{ mermaid: mermaidPlugin }}`.
- [x] Theme detection lives in `markdown.container.tsx` via a
      `useIsDark()` hook (useState seeded synchronously, useEffect
      installs a `MutationObserver` on `document.documentElement` class
      changes). Container forwards `mermaidTheme: 'dark' | 'default'` to
      the presentational. Presentational stays free of effects.
      `mermaidTheme` is omitted from the public `Markdown` prop type so
      callers can't override it.
- [x] Pass `securityLevel: 'strict'` to the mermaid plugin config via
      Streamdown's top-level `mermaid={{ config: { theme, securityLevel } }}`
      prop. `as const` cast keeps the literal types narrow.
- [x] Component test: mermaid fenced block renders without throwing.
      (Full SVG render is async + needs DOM features JSDOM lacks; verified
      via manual QA instead.)
- [x] Verify the four gates: typecheck clean, 1218 pure tests, 459 unit
      tests (+1 new), chaperone 0/0 (408 files).
- [ ] Manual QA: ask the user to paste the screenshot's mermaid block
      into a chat and confirm it renders, then toggle light/dark and
      confirm the diagram re-themes.

**Verification:** all four gates green; user confirms rendering and
theme toggle.

---

## Phase M4 — Enable Shiki code highlighting

**Goal:** code blocks gain syntax tokens; existing chrome preserved.

- [x] Register `@streamdown/code` in the `plugins` prop with
      `shikiTheme={['github-light', 'github-dark']}`.
- [x] Existing visual chrome preserved. Streamdown still calls our
      `code` component override for fenced blocks, so the rounded card +
      language label header + scrollable pre + monospace 13px stays
      exactly as before. Replaced `String(children)` → render `children`
      directly so Shiki's highlighted spans pass through instead of
      being flattened to text. Kept a stringified copy only for the
      `isBlock` heuristic.
- [x] Component tests: existing fenced-block test (language label +
      content) still passes, confirming chrome is intact. Token-level
      assertion deferred to manual QA — Shiki highlighting is async
      and relies on web workers / DOM features JSDOM doesn't provide.
- [x] Verify the four gates: typecheck clean, 1218 pure tests, 459 unit
      tests, chaperone 0/0 (408 files).
- [ ] Manual QA: ask the user to view a code-heavy assistant message and
      confirm tokens appear in both light and dark.

**Verification:** all four gates green; user confirms highlighting.

---

## Phase M5 — Streaming verification (descoped)

**Goal:** explicitly defer two M5 items that turned out to be polish, not
correctness.

- [~] **Deferred: wire `isStreaming` end-to-end.** Investigated; no per-entry
  streaming flag exists in the renderer's transcript model. Plumbing it
  requires touching `SessionTranscript` (compute streaming entry id),
  `ConversationItem` (forward), and `TranscriptEntry` (pass to all six
  `<Markdown>` calls). `isAnimating` only controls Streamdown's caret
  indicator and animation events; it does **not** gate streaming
  correctness. `parseIncompleteMarkdown` defaults to `true`, so the
  core streaming benefit is already on. Recorded as deferred work.
- [~] **Deferred: retire the cut-detector canary.** The canary is dev-only
  (`import.meta.env.DEV` gate) and can only emit `console.warn`. It is
  harmless. Leave in for now; reassess after a few real-world streams.
  If it turns out to false-positive on Streamdown output, delete then.
  Removing it now is a blind change without observation.
- [~] `rootRef` removal: blocked on canary retirement.

**Verification:** decisions recorded in this plan and surfaced to the user.
Code is unchanged in this phase.

---

## Phase M6 — Cleanup, removal of `react-markdown`, ship

**Goal:** dead deps gone; final QA pass; PR open.

- [x] `grep -rn "react-markdown\|remark-gfm" src electron` confirms zero
      remaining imports outside `markdown.container.tsx` (where the only
      reference was a stale comment, since updated).
- [x] `npm uninstall react-markdown remark-gfm`. `package.json` now lists
      `streamdown@2.5.0`, `@streamdown/mermaid@1.0.2`, `@streamdown/code@1.1.1`
      and no longer lists `react-markdown` or `remark-gfm`.
- [x] Verify the four gates one more time: typecheck clean, 1218 pure
      tests, 459 unit tests, chaperone 0/0 (408 files).
- [ ] Run the full QA checklist from the spec ("Integration / manual
      QA"). Have the user execute it; document any deltas.
- [x] Add a changeset entry at `.changeset/streamdown-mermaid.md`.
- [ ] Commit the formatting/whitespace deltas Prettier produces in a
      separate `chore: prettier` commit if `chaperone check --fix` rewrites
      unrelated files (per CLAUDE.md). Currently no unrelated files were
      touched — only the spec/plan docs Prettier reformatted, which are
      part of this branch already.
- [ ] Open PR against `master` once user confirms QA.

**Verification:** PR green; QA checklist passes; ready for review.

---

## Cross-phase reminders for the agent

These exist because context will compact and prior reasoning is fragile.
Re-read this section at the start of every phase:

- The user asked for **mermaid support**. Streamdown is the chosen path
  because it solves mermaid _and_ fixes the streaming canary _and_ gives
  Shiki highlighting in one move. If a phase looks like it's becoming
  excessive, ask: "could I have just added a `MermaidBlock` and kept
  `react-markdown`?" If yes, reconsider scope.
- **Visual parity is the bar in M2.** Do not redesign the markdown look.
  The existing classes in `markdown.presentational.tsx` lines 17–183 are
  the spec.
- **Presentational components must not contain `useEffect`** (CLAUDE.md
  - a memory entry from past feedback). Theme detection lives in the
    container.
- **Tailwind 4** uses `@source` directives, not `content` arrays. Add
  `@source` for every installed `@streamdown/*` package or its classes
  get tree-shaken away.
- **Use fnm, not nvm.** `eval "$(fnm env)" && fnm use` before any npm
  command.
- **Don't run `npm run dev`.** Hand UI verification to the user.
- **Don't `--no-verify` commits.** Address pre-commit failures, don't
  bypass them.
- **Streamdown plugin packages are separate npm installs.**
  `@streamdown/mermaid`, `@streamdown/code`. Already pulled in M1.
