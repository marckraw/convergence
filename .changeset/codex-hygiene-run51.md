---
'convergence': patch
---

Codex hygiene: no recovery note after `/clear`, a warming-up usage pill, and one thread per session

- After clearing a Codex conversation, the next message no longer claims "Codex thread was no longer available — previous provider context may be missing". Nothing is missing after a deliberate clear, so nothing is announced; a conversation that really was lost still says so (MAR-2854).
- The composer's Codex usage pill reads "warming up" while the resident app-server is starting, instead of a number it can no longer stand behind (MAR-2825).
- A session sent a second message before its first thread exists now ends up with one thread on the server rather than two (MAR-2826).
- Internal: a turn capture that cannot be written down is reported instead of escaping as an unhandled rejection (MAR-2630).
