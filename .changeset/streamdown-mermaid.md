---
'convergence': minor
---

Add Mermaid diagram and syntax-highlighted code support in chat by migrating the markdown renderer from `react-markdown` to Vercel's [Streamdown](https://streamdown.ai).

LLMs frequently emit ```mermaid fenced blocks (flowcharts, sequence diagrams, class diagrams); these now render as interactive SVG with zoom, copy, download, and fullscreen controls, and respect the app's light/dark theme. Fenced code blocks gain Shiki syntax highlighting (`github-light` / `github-dark`) plus copy/download buttons. Streamdown's `parseIncompleteMarkdown` also handles mid-stream incomplete markdown more cleanly than the previous renderer.

Note: fenced code blocks switch from the previous custom card chrome (small-caps language label) to Streamdown's default chrome. Inline code keeps the existing pill style.

Public `Markdown` component API is preserved. Removed `react-markdown` and `remark-gfm` dependencies; added `streamdown`, `@streamdown/mermaid`, `@streamdown/code`. Mermaid runs with `securityLevel: 'strict'` so LLM-supplied diagram code cannot execute inline JS.
