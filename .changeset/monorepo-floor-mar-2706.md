---
'convergence': patch
---

The monorepo floor: the app now lives in `apps/convergence` inside an npm
workspaces repo, with `packages/` reserved for the code it will share. No
user-visible change — same app, same artifact names, same update feed
(MAR-2706).
