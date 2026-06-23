---
'convergence': patch
---

Fix the Skills dialog mislabelling home-directory skills as "project" skills. The per-provider "project" scope walk climbed every ancestor up to the filesystem root, so anything in `~/.agents/skills` (and similar) was tagged project-local simply because the home directory is an ancestor of the repo — most visibly, Antigravity claimed every `~/.agents/skills` skill as a project skill.

The ancestor walk now stops at the home directory (shared `collectProjectAncestorSkillRoots` helper). Home-level skills are still discovered via each provider's fixed global roots and shown as **Global**; the **Project** bucket now reflects only skills committed in the repository.
