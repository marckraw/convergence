---
'convergence': minor
---

Add Windows support foundations (Phase 7).

- Split platform-sensitive modules under filename suffix convention
  (`*.darwin.ts`, `*.win32.ts`, `*.shared.ts`) with thin dispatchers: `shell-path`,
  `window-effects`, `app-chrome`, `which-binary`, `shell-exec`.
- `electron-builder.yml` ships a Windows NSIS target; `package:win` and
  `package:win:dir` scripts added. Windows releases are unsigned; SmartScreen
  warning is acceptable for the first phase.
- New `publish-win-release.yml` GitHub workflow mirrors the Mac release path
  (no signing).
- CI gains a `verify-windows` job running `test:pure` + `test:unit` +
  `typecheck` on `windows-latest`.
- Provider status dialog now shows platform-aware install hints (commands,
  docs links, Windows-specific notes) for any unavailable provider.
- Workspace creation rejects Windows reserved branch names (CON, PRN, AUX,
  NUL, COM1-9, LPT1-9; segments ending in `.` or space) with a clear error.
- Workspace creation warns when the computed worktree path would exceed
  Windows' default 260-char limit, so users can enable long-paths group
  policy or pick a shorter base directory.
- Child-process spawns use `shell: true` on Windows for `.cmd`/`.bat`/`.ps1`
  shims so npm-globally-installed provider CLIs launch reliably.
- Repo-root `.gitattributes` normalizes line endings to LF on all platforms
  to keep diffs consistent on Windows checkouts.
- Phase 0-6 specs verified against code and marked DONE; phase-7 spec records
  deviations from the original plan.
