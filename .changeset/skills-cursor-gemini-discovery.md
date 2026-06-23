---
'convergence': minor
---

Discover Cursor and Gemini-family project skills in the Skills dialog.

- **Cursor** skills are now read from the filesystem — `.cursor/skills/<name>/SKILL.md` from the working directory up to the repository root (Cursor is project-scoped only; no global dir), invoked as `/name`. Previously Cursor skills were derived from the ACP "available commands" RPC, which doesn't surface filesystem `.cursor/skills`, so they never appeared. The ACP command catalog is unchanged for the session composer; a dedicated `CursorFilesystemSkillsService` powers the dialog.
- **Antigravity** now also scans the Gemini-family `.gemini/skills` project directory (alongside `.agents/skills` / `.agent/skills`), so Gemini CLI workspace skills show up.

Both are repo-root-capped so home/global skills are never mislabelled as project skills.
