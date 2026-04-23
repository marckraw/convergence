---
'convergence': patch
---

chore(markdown): add runtime canary that warns in the console when a rendered assistant message appears to be missing its tail versus the source string. Catches silent truncation bugs from the markdown parser, the conversation-item persistence pipeline, or streaming flush edge cases without needing DevTools inspection.
