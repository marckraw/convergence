---
'convergence': patch
---

A send the provider already accepted is never reported as failed because the local record could not be written; the loss is noted on the conversation instead. After a restart, an input that was mid-delivery says it may already have reached the provider, so you can check the conversation before sending it again.
