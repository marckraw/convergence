---
'convergence': patch
---

Make project skill discovery faithfully match the provider CLIs. The per-provider "project" scope walk previously climbed every ancestor up to the filesystem root, so skills in `~/.agents/skills` (and similar) were tagged project-local just because the home directory is an ancestor of the repo — most visibly, Antigravity claimed every `~/.agents/skills` skill as a project skill.

A shared `collectProjectAncestorSkillRoots` helper now resolves project skills from the working directory **up to and including the git repository root, then stops** — mirroring how the CLIs scope project skills (Codex scans up to the repository root; Claude Code uses the project root). The home directory is a hard ceiling. So the **Project** bucket reflects only skills inside the repository, and home-level skills surface as **Global** via each provider's fixed global roots.
