# Streamdown + Mermaid Migration

## Goal

Replace the renderer's markdown stack (`react-markdown` + `remark-gfm`) with
[Streamdown](https://streamdown.ai), Vercel's drop-in replacement designed for
AI-streamed markdown, and enable Mermaid diagram rendering in chat transcripts.

The triggering user request is "support Mermaid diagrams" — LLMs frequently
emit `\`\`\`mermaid` fenced blocks (flowcharts, sequence diagrams, class
diagrams). Today these render as plain code text. Adopting Streamdown solves
this _and_ fixes adjacent problems we already paid to work around:

- The dev-only "content cut" canary in `src/shared/ui/markdown.container.tsx`
  exists because `react-markdown` drops trailing tokens during streaming.
  Streamdown parses incomplete markdown by design; the canary becomes
  redundant.
- Code blocks render with no syntax highlighting today. Streamdown's
  `@streamdown/code` plugin adds Shiki highlighting, copy/download, and
  language detection.
- LLM-emitted links and images currently render with no origin filtering.
  Streamdown ships `rehype-harden` plus a link-preview modal as a default.

## Product intent

- Mermaid fenced code blocks render as interactive SVG diagrams that respect
  the app's light/dark theme.
- Code blocks gain Shiki syntax highlighting matching the existing visual
  language (rounded card with header label, dark/light tokens via `oklch`).
- Streaming behavior is preserved or improved. No regression in mid-stream
  rendering smoothness.
- All existing markdown surfaces in chat (user message, assistant message,
  thinking block, approval description, input request, note) keep their
  current visual styling: same paragraph rhythm, list indentation, table
  chrome, blockquote bar, link colour, and `size="sm"` compact variant.
- The dev-only content-cut canary is removed once Streamdown's incomplete-
  markdown handling is verified to subsume its purpose.

## Non-goals

- **No LaTeX/KaTeX in V1.** The repo does not currently render math; adding
  `@streamdown/math` is out of scope for this migration. Trivial follow-up.
- **No CJK plugin.** Same reasoning.
- **No fullscreen mermaid mode customisation.** Use whatever the plugin
  ships by default.
- **No custom mermaid theme variables.** Map the plugin's `theme` config
  to `'default'` / `'dark'` based on `document.documentElement.classList`.
  Token-level theming (mapping mermaid colours to our oklch tokens) is
  deferred.
- **No image-origin allowlist customisation.** Use Streamdown's defaults.
  If a real LLM output gets blocked we revisit.
- **No new markdown features in transcripts** (footnotes, task lists, etc.)
  beyond what GFM already enables.
- **No removal of the `Markdown` component public API.** Callers in
  `transcript-entry.presentational.tsx` keep importing
  `@/shared/ui/markdown` with the same `{ content, className, size, rootRef }`
  prop shape.

## Open assumptions (must be resolved in Phase M0)

1. **Component override mechanism.** Streamdown's docs do not clearly
   document a `components`-style override prop. Today we customise every
   block element (`p`, `h1`–`h3`, `ul`, `ol`, `li`, `blockquote`, `hr`, `a`,
   `table`, `thead`, `th`, `td`, `code`, `pre`) with Tailwind classes via
   `react-markdown`'s `Components` prop. Phase M0 spike confirms how
   Streamdown allows the same. If Streamdown only supports class-level
   theming via Tailwind tokens, the override layer collapses into CSS
   variables already defined in `src/app/global.css`.
2. **`size="sm"` compact variant.** The current API supports a `sm` mode
   used in transcripts. Streamdown does not have an equivalent. M0 confirms
   how to express two text-density modes through whatever override
   mechanism Streamdown provides.
3. **`rootRef` forwarding.** Used by the cut-detector canary. If the canary
   is removed (M5), `rootRef` becomes unused and can be dropped from the
   public API. Must verify no other caller relies on it.
4. **Bundle impact.** Streamdown core (~96 KB unpacked) plus `mermaid@11`
   (~600 KB minified) plus `shiki@3` (heavy; lazy-loaded by plugin) is a
   meaningful renderer bundle increase. M0 measures the delta against the
   current `react-markdown` + `remark-gfm` baseline. **Budget: generous —
   the user has explicitly accepted a meaningful increase in exchange for
   the feature set.** M0 still records the number for visibility, and we
   still prefer lazy-loaded plugin chunks where Streamdown supports it,
   but the migration is not gated on a hard size cap.

## V1 behavior

### Public API preserved

`@/shared/ui/markdown` continues to export `Markdown` and `MarkdownProps`
with the existing shape:

```ts
interface MarkdownProps {
  content: string
  className?: string
  size?: 'sm' | 'md'
  rootRef?: Ref<HTMLDivElement> // may be removed if canary deleted
}
```

Internally:

- `markdown.presentational.tsx` switches from `<ReactMarkdown components=…>`
  to `<Streamdown plugins={…} mermaid={…} shikiTheme={…}>`.
- The Tailwind override map is reshaped to whatever Streamdown supports
  (TBD per M0). Visual parity is the acceptance bar.
- `markdown.container.tsx` either keeps the cut-detector canary (if M5
  shows Streamdown still drops content under streaming) or simplifies to
  a thin pass-through.

### Mermaid rendering

- Enabled via `@streamdown/mermaid` plugin registered in the Streamdown
  `plugins` prop.
- Theme: read `.dark` class on `document.documentElement` once at mount
  and on `MutationObserver` change; pass `theme: 'dark' | 'default'` to
  the plugin.
- Errors: a malformed `\`\`\`mermaid` block falls back to the raw code
  block style (the plugin's documented error fallback). LLMs frequently
  emit syntactically invalid mermaid mid-stream; we do not crash the
  transcript on it.
- Lazy-load: mermaid + shiki are heavy. M0 verifies the plugins are
  imported via dynamic chunks, not the synchronous main bundle.

### Code highlighting

- Enabled via `@streamdown/code` plugin.
- Theme arrays: `['github-light', 'github-dark']` to match the existing
  light/dark palette. Token tuning deferred.
- Existing visual chrome (rounded card with language label header,
  scrollable pre, monospace 13px) is preserved either by Streamdown's
  default rendering or by re-applying the existing classes around the
  plugin output. Acceptance: visual parity.

### Streaming behaviour

- `isAnimating` prop is wired to the chat surface's "is this entry being
  streamed" signal. Today the assistant message text grows as tokens
  arrive — passing `isAnimating={true}` while the entry is live and
  `false` once the entry is finalised lets Streamdown render the
  caret/animation indicators it ships.
- We expose this through the `Markdown` component's API by adding an
  optional `isStreaming?: boolean` prop. Default `false` preserves
  existing behaviour for non-chat callers.

### Theming

- Streamdown's docs show it expects `oklch` design tokens (`--background`,
  `--foreground`, `--primary`, `--border`, `--radius`, etc.). The repo
  already defines all of these in `src/app/global.css`.
- Tailwind 4 `@source` directive added to `src/app/global.css`:
  `@source "../node_modules/streamdown/dist/*.js";`
  Plus matching entries for each `@streamdown/*` plugin installed.
- No new colour tokens introduced.

## Architecture

### File-level changes

- `src/shared/ui/markdown.presentational.tsx` — body rewritten to wrap
  `Streamdown`. Public component name and props unchanged.
- `src/shared/ui/markdown.container.tsx` — keeps the canary in M2–M4;
  simplified or deleted in M5.
- `src/shared/lib/markdown-cut-detector.pure.ts` and its test — deleted
  in M5 if canary is dropped.
- `src/app/global.css` — add `@source` directives for Streamdown and
  installed plugins.
- `package.json` — add `streamdown`, `@streamdown/mermaid`,
  `@streamdown/code`. Remove `react-markdown` and `remark-gfm` once no
  caller imports them. Verify with grep before removal.
- No changes to widget/feature/entity layers. The `Markdown` consumer
  contract is preserved.

### Dependency direction

The `Markdown` component lives in `shared/ui/`, so all renderer layers
keep importing through the same boundary. No FSD-lite violations.

The `markdown.presentational.tsx` file currently has zero side-effectful
hooks (renders synchronously from props). Streamdown's component is
itself a React component; theme detection (light/dark) for mermaid
introduces a `useEffect` for the `MutationObserver`. To preserve the
"presentational has no effects" rule from `CLAUDE.md`, that effect lives
in `markdown.container.tsx`, which already owns side effects.

## Testing strategy

### Pure layer

- Keep existing `markdown-cut-detector.pure.test.ts` until canary is
  removed in M5.
- No new pure tests; Streamdown is a black box renderer.

### Component layer

- New tests in `src/shared/ui/markdown.presentational.test.tsx` (or
  whatever the existing convention is — verify in M0):
  - Renders inline code with the existing pill chrome.
  - Renders block code with language label + scroll container.
  - Renders a mermaid block as an SVG element (assert `<svg>` present).
  - Renders an _invalid_ mermaid block as a fallback code block (does
    not crash).
  - GFM features still work: tables, strikethrough, task lists.
  - `size="sm"` produces compact paragraph spacing.
  - `size="md"` produces standard paragraph spacing.

### Integration / manual QA

A QA checklist runs at the end of M5:

- Paste a real chat transcript containing mermaid into a session and
  verify it renders without console errors.
- Toggle light/dark; mermaid diagram re-themes within one frame.
- Stream a long assistant message containing a mermaid block; verify
  the partial mermaid does not crash mid-stream and finalises cleanly.
- Stream a long assistant message containing a fenced TypeScript code
  block; verify Shiki tokens appear once and don't re-flash on every
  token.
- Open Settings, Command Center, and a Note; verify markdown rendering
  is unchanged on those surfaces.
- Performance: scroll a session with 200+ messages and confirm no
  noticeable jank vs. the pre-migration baseline.

## Risks and mitigations

- **Component override API gap.** If Streamdown does not expose a
  `components`-equivalent override, the Tailwind class layer must move
  to global CSS rules targeting Streamdown's emitted DOM. Mitigation:
  M0 spike resolves this before any production change. If the gap is
  too wide, abort migration and fall back to Path A (react-markdown +
  custom MermaidBlock).
- **Bundle size regression.** Mermaid + Shiki are heavy. Budget is
  generous (per user direction). M0 still records the delta for the
  record. Lazy-loading via Streamdown's plugin system is a "nice to
  have" rather than a gate.
- **Streaming visual regression.** Streamdown is younger than
  react-markdown; edge cases possible. Mitigation: M5 streams real
  LLM output through both renderers and diffs visual output. Cut-
  detector canary stays in until streaming parity is verified.
- **Mermaid security.** Mermaid runs LLM-supplied diagram code.
  Mitigation: pass `securityLevel: 'strict'` to the mermaid plugin,
  blocking inline JS in diagrams.
- **Apache-2.0 vs the existing license.** The repo's licence is MIT (or
  whatever — verify in M0). Apache-2.0 is compatible. No issue, just
  confirm.
- **Electron renderer compatibility.** Streamdown emits `<svg>` and
  uses dynamic imports. The renderer has `contextIsolation: true` and
  `sandbox: false`; no CSP. Should work without changes. Verified at
  M3 manual QA.

## Deferred / future work

- LaTeX/KaTeX via `@streamdown/math`.
- CJK punctuation via `@streamdown/cjk`.
- Mermaid theme tokens mapped to oklch design tokens.
- Custom Shiki theme aligned to oklch palette.
- "Open mermaid in viewer" action on the diagram (zoom/pan).
- **Wire `isStreaming` end-to-end** so Streamdown's caret indicator activates
  during assistant streaming. Requires plumbing `session.status === 'running'`
  - last-active-entry detection through `SessionTranscript` →
    `ConversationItem` → `TranscriptEntry`. Cosmetic-only — streaming
    correctness already works via `parseIncompleteMarkdown` default.
- **Retire the cut-detector canary** once a few real streams confirm
  Streamdown does not silently drop tail content. After retirement, drop
  the `rootRef` forwarding from the public `Markdown` API surface.
