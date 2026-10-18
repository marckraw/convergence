---
'convergence': patch
---

On a remote host that serves it, the parallel-work panel can now show the end of a background task's output: select the task and press "Read output tail". The host redacts it and sends up to 64 KiB of whole lines; if it will not, the panel says why in words. And an answer to a request (a choice, a plan, a form) is no longer sent to a remote host that cannot read it: Convergence leaves a note saying so instead.
