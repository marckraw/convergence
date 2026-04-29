---
'convergence': patch
---

Revert the stuck approval recovery change from 0.28.3. Approval actions once again remain tied to the latest transcript item, and Codex exits no longer force an active session into a failed state based on local provider bookkeeping.
