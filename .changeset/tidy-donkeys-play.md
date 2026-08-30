---
'convergence': patch
---

A remote session now says where it works before you send it (MAR-2689).

Pick a remote machine in the composer strip and a second slot appears beside it:
the Projects that machine already has, plus the repository this project points
at. The Project holding the same repository is preselected by matching git
origins; with no match it falls back to the repository. The place you see is the
place the session is given — Project mode sends the machine's own directory,
Repository mode sends the clone URL — and the session records it, so a live
session states where it works instead of leaving you to guess.

Until now the place was derived silently from whichever project the session was
born in, which is how a session dispatched from the Convergence project told a
daemon to clone Convergence. Remote sessions started before this release say
_Unknown_ rather than a guess. A session born on a remote machine now defaults
to the `yolo` permission preset, since nobody is there to click allow; a preset
you set yourself is never overwritten. Local sessions are unchanged.

Rotating a machine's daemon token in Settings now refreshes the composer for
that machine. Both the provider row and the Projects slot say they are asking
again and re-read under the new credential, instead of going on showing what
the old one answered. Testing the connection does the same when the machine has
changed what it offers — a daemon upgraded at the same address that no longer
serves Projects stops being offered them in the strip, instead of listing places
the machine would refuse to start a session in.
