---
'convergence': patch
---

A relay delivery to a session that is mid-turn now waits instead of failing.

A wire firing at a target whose provider was still finishing a turn — or reconnecting — used to be refused outright: the delivery failed, the crew was hailed about it, and the message was never sent. The refusal is now understood for what it is, and the message waits in the target's queue exactly as it does when Convergence already knows the target is busy, going out on the next turn.

The step on the canvas says why it is waiting rather than just that it is queued, so a delivery waiting politely can be told apart from one that actually broke. A delivery that broke for any other reason still fails loudly, with its own reason shown.
