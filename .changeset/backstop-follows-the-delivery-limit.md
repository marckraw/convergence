---
'convergence': patch
---

The run's hop backstop now follows the crew's delivery limit (MAR-2966).

Twenty hops used to be a fixed ceiling on every run, so any delivery limit
above it was decoration: a fan-out of six spends twelve hops a round, and a
crew that had budgeted 48 deliveries lost a wire in round two — disarmed, not
merely held. The ceiling is now the firing crew's own limit, with twenty as the
floor for a crew that never stated one, and the refusal names both numbers:
what the run spent, and the ceiling it hit.

The count stays the whole run's, across every crew, so a session in two crews
still cannot loop forever between them — which is now the only case the
backstop catches. Inside one crew the delivery limit is reached first, and that
guard hails you and leaves the wire armed. Crew settings says the rule out
loud: the delivery limit box carries one sentence about the hard ceiling, and a
crew under the floor is told the number that actually disarms rather than being
left to assume its own limit does.
