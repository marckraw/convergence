---
'convergence': patch
---

Fix terminal dock single-leaf width collapse: when the dock held a single pane, the leaf took intrinsic width inside the dock's flex-row container instead of filling it. Split layouts were unaffected because `Group` already stretched. Leaf root now carries `w-full min-w-0`, matching the `Group` path.
