---
'convergence': patch
---

Remote sessions refuse a local account instead of quietly ignoring it
(MAR-2208, PA10). Provider accounts live on this machine and the execution-host
wire protocol carries no account reference, so a remote session always runs on
the remote host's own credential. It now says so: the composer replaces the
account picker with "Default account · local only" and its reason, no selection
is sent, and the backend refuses a remote turn that names one before anything is
spawned or recorded — rather than running on a credential nobody chose while
attributing the turn to one they did.
