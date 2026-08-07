---
'convergence': patch
---

Your response to a quoted passage no longer renders as part of the quote
(MAR-2280). When you annotated an agent's message and sent it, your own words
came out inside the quote block — looking, and reading, like something the
agent had said rather than your answer to it. Markdown pulls a line directly
under a blockquote into that blockquote; the compiled message now leaves a
blank line, so each quote stands on its own and your response sits beneath it
as your own paragraph. The "(from your earlier message)" label still sits
directly above the quote it belongs to.
