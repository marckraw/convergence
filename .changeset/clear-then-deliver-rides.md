---
'convergence': patch
---

A dispatch whose `/clear` fails is no longer stranded: the reset is retried once and the message is delivered into the still-active conversation; a delivery that dies later is written back onto Loom's dispatch row.
