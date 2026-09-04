---
'convergence': patch
---

Lanes: creating a lane works on the installed app again (MAR-2814).

Inside an Electron main process Node's `fs` is patched so that `*.asar` files
read as directories, while `unlink` and `rmdir` stay real. A copied
`Electron.app` carries such archives, so the lane's rollback could not remove
one and reported `ENOTEMPTY` — and that cleanup error was thrown over the top
of whatever had really failed, so the dialog named a folder and never a reason.
The pre-scan had the same blind spot from the other side: it counted an
archive's imaginary contents instead of the archive, which is what the copy
method shown on the door is derived from.

Every walk and every delete a lane performs now runs through system tools
(`find`, `stat`, `rm`, `cp`), outside the patch by construction. A rollback that
fails is disclosed but never replaces the cause. The new canary runs the real
lane service under the real `electron` binary, where all of this is visible —
the runtime every previous lane test was missing.
