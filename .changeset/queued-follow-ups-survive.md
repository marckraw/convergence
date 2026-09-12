---
'convergence': patch
---

Queued follow-ups survive the turn they waited behind, and a failed one can be delivered again.

A follow-up that was never attempted no longer fails with the turn ahead of it: rows still waiting stay waiting and the next turn delivers them in order, so a stopped turn no longer strands the work queued behind it. Because nothing is attempted, nothing is reported ended — the relay hop stays owed and reads as waiting instead of as a delivery failure.

A failed follow-up card now offers **Deliver now**, which re-queues the message exactly as it arrived (attachments, skills, account and receipt included) while leaving the failed row as the record of the first attempt. Dismiss now reaches a failed card too, instead of leaving it with a disabled ✕ and no way out.

Delivering again re-opens the errand on the run it belonged to: History shows the second attempt as its own step on the same run, the first attempt keeps its own record, and a re-delivered relay opener stays plumbing rather than counting as a lap of work.
