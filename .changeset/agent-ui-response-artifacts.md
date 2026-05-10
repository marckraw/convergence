---
'convergence': patch
---

Add experimental agent UI response artifacts. Assistant Markdown can now include
a `convergence-ui-html` artifact block that is rendered in a sandboxed
right-side panel while the normal Markdown answer remains visible in the
transcript. Artifact-bearing turns can be reselected, and empty or malformed UI
HTML shows a safe placeholder instead of rendering an iframe.
