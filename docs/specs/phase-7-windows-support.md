# Phase 7: Windows Support — Detailed Spec

> Parent: `docs/specs/project-spec.md`
> Builds on: Phase 6 (project-aware tooling, full end-to-end session flow on macOS)
> Status: **IN PROGRESS** (2026-04-17) — platform splits, builder config, CI, and onboarding copy landed. Pending: Windows smoke matrix on real hardware, chaperone `process.platform` rule, `npmRebuild` flip (see Deviations).

## Deviations From Original Plan

Captured during implementation on 2026-04-17. The overall intent is unchanged, but several mechanics were adjusted for minimum churn and maximum backwards compatibility:

1. **Dispatcher keeps its existing suffix.** The spec originally called for a bare `<name>.ts` dispatcher. We kept `<name>.service.ts` / `<name>.pure.ts` so existing imports stay green and file names remain consistent with the repo-wide `*.service.ts` / `*.pure.ts` convention enforced by chaperone. The dispatcher is still the only file that reads `process.platform` for that module.
   - `shell-path.service.ts` (dispatcher) → `shell-path.darwin.ts` / `shell-path.win32.ts` / `shell-path.shared.pure.ts`
   - `window-effects.pure.ts` (dispatcher) → `window-effects.darwin.pure.ts` / `window-effects.shared.pure.ts`
   - `app-chrome.service.ts` (dispatcher) → `app-chrome.darwin.ts` / `app-chrome.shared.ts` (Windows/Linux share a no-op dock path)
2. **No separate `binary-locations.*` modules.** Fallback install-path lists live directly inside `shell-path.darwin.pure.ts` and `shell-path.win32.pure.ts`. Merge/dedup helpers live in `shell-path.shared.pure.ts`. If a third consumer needs fallback lookup we'll lift it to its own module then.
3. **`npmRebuild: false` retained.** `electron-builder.yml` still has `npmRebuild: false` because Mac packaging already relies on the pre-packaging `electron-rebuild` step. Switching this to `true` needs to be verified on Windows in the smoke matrix — if `better-sqlite3` fails to load from the unpacked installer, flip it then. Recorded as risk item 9.
4. **Onboarding surface landed inside the existing provider-status dialog** rather than a new `platform-onboarding` slice. The dialog now renders an install-hint card (commands, platform note, docs link) below any provider marked unavailable. Hints are indexed by `(providerId, platform)` in `src/features/provider-status/install-hints.pure.ts`. If we later need a full first-run panel, we can promote these hints without changing the lookup.
5. **Windows CI added as a second job, not a matrix.** `ci.yml` now has `verify` (ubuntu-latest, full gate including chaperone) and `verify-windows` (windows-latest, `test:pure` + `test:unit` + `typecheck`). Chaperone stays Linux-only because its release assets are OS-specific.
6. **Chaperone `process.platform` rule deferred.** Chaperone 0.7.1's regex rule API takes a single glob and does not support exclusion lists, so a clean "forbid `process.platform` outside dispatchers" rule would either be too narrow to be useful or too broad to land. Instead we (a) audit manually and (b) keep all platform branching inside a small, known set of dispatcher files. Current compliant baseline (all approved):
   - `electron/preload/index.ts` — IPC data exposure
   - `electron/main/index.ts` — IPC data exposure
   - `electron/main/app-chrome.service.ts` — dispatcher
   - `electron/backend/environment/shell-path.service.ts` — dispatcher
   - `electron/backend/provider/detect.ts` — calls tested pure helper `resolveWhichCommand(platform)`; no comparison branch in this file
   - `electron/backend/provider/which-binary.pure.ts` — tested pure dispatcher

   When chaperone gains glob exclusions (or a "one-of" matcher), add the rule then. The existing compliance is enforced via convention + review.

## Completed Slices (2026-04-17)

- Slice 1: `shell-path` platform split — pure modules use `path.posix` / `path.win32` namespaces to keep separator tests host-agnostic.
- Slice 2a: `window-effects` platform split.
- Slice 2b: `app-chrome` platform split; `electron/main/index.ts` now calls `applyDockIcon()` / `shouldQuitOnWindowAllClosed()` instead of branching inline.
- Slice 3: `electron-builder.yml` Windows NSIS target; `package:win` and `package:win:dir` scripts; `build/icon.ico` generated from `build/icon.png`.
- Slice 4: `.github/workflows/publish-win-release.yml` (mirror of mac workflow, no signing); `verify-windows` job added to `ci.yml`.
- Slice 5: Install-hint cards in `ProviderStatusDialog` for Claude Code, Codex, Pi with platform-specific notes.
- Slice 6: `.gitattributes` with `* text=auto eol=lf` for CRLF/LF consistency; `branch-name-validation.pure.ts` rejects Windows reserved names (CON, PRN, AUX, NUL, COM1-9, LPT1-9) and segments ending in `.` or ` ` — wired into `WorkspaceService.create` and a no-op on non-Windows hosts.
- Slice 6b: `detect.ts` platform branch lifted into a tested pure `resolveWhichCommand(platform)` helper.
- Slice 7a: `shell-exec.pure.ts` — `needsShellForSpawn(binaryPath, platform)` returns true on Windows only for `.cmd`/`.bat`/`.ps1` wrappers. Applied to every provider spawn site (Claude Code, Codex, Pi) plus `detect.ts` version probe so npm-globally-installed shims launch without Node 20+'s EINVAL on direct `.cmd` exec.
- Slice 7b: `long-path.pure.ts` — `checkWorktreePathLength` flags worktree paths exceeding Windows' 260-char `MAX_PATH` with actionable guidance (Group Policy "Enable Win32 long paths" or shorter projects directory). Wired into `WorkspaceService.create` as a `console.warn`; no hard block yet so smoke testing still lets us see what breaks if long paths aren't enabled.
- Slice 7c: Changeset `windy-pines-whisper.md` added (`minor` bump) so release notes carry the Phase 7 work.

Baseline before phase: 316 pure tests. After Slice 7c: 360 pure + 70 unit, 139 files chaperone-clean, typecheck clean.

## Objective

Bring Convergence to Windows 10/11 at functional parity with macOS, with a code structure that makes platform-specific behavior obvious from filenames. Ship unsigned NSIS installers from GitHub Actions `windows-latest` alongside the existing macOS release flow. Keep ongoing maintenance cost low by enforcing a filename-suffix convention (`*.darwin.ts`, `*.win32.ts`, `*.shared.ts`) for every module that diverges across platforms.

## Success Criteria

All must be true before Phase 7 is complete:

1. `npm run package:win` produces a working `Convergence-<version>-<arch>.exe` NSIS installer on Windows 11
2. CI job on `windows-latest` runs `npm run test:pure` + `npm run test:unit` green on every PR
3. `publish-win-release.yml` workflow uploads Windows artifacts to the same GitHub Release tag as macOS on `v*` tag push
4. Every module that branches on `process.platform` is split into `*.darwin.ts`, `*.win32.ts`, and (optionally) `*.shared.ts`, with a thin dispatcher under the original filename
5. `chaperone check` passes with a new rule forbidding `process.platform` checks outside of dispatchers and platform files
6. Claude Code, Codex, and Pi providers are detected and launchable on Windows when the respective CLIs are installed
7. Git worktree create/list/delete works on Windows with stock Git for Windows
8. Existing `convergence.db` from a macOS install opens unchanged on Windows (same SQLite file format, only location differs via `app.getPath('userData')`)
9. First-run experience on Windows shows a provider-onboarding panel when no provider CLI is detected, pointing users at install instructions
10. Explicit non-goals (below) are documented and deferred, not silently skipped

## Scope

### In scope

- Filename-suffix convention for platform splits
- Refactor of existing Darwin-only modules into the new convention
- Windows PATH resolution and binary lookup
- `electron-builder.yml` Windows target (NSIS, unsigned)
- `.github/workflows/publish-win-release.yml` (mirror of mac workflow, minus signing)
- `.github/workflows/ci.yml` Windows runner addition
- `build/icon.ico` asset
- Platform-onboarding slice in renderer for Windows CLI-install guidance
- Updates to `docs/specs/release-distribution-and-changelog.md` with a Windows distribution section
- chaperone rule: `process.platform` usage only allowed in dispatcher and platform-suffixed files

### Out of scope

- Windows code signing (EV certs, Azure Trusted Signing) — deferred; SmartScreen warning acceptable for now
- Microsoft Store / AppX / MSIX distribution
- WSL auto-provisioning
- Auto-updater (electron-updater) on Windows — deferred with macOS auto-update
- Embedded terminal on Windows (terminal is out of scope for all platforms per project-spec)
- Windows-specific installers beyond NSIS (portable, MSI, Squirrel.Windows)
- ARM64 Windows builds — x64 only for first release
- Localization of onboarding copy

## Platform Split Convention

### Filename suffixes

Platform-sensitive modules use these suffixes:

- `<name>.darwin.ts` — macOS-only implementation
- `<name>.win32.ts` — Windows-only implementation
- `<name>.linux.ts` — Linux implementation (optional, added when needed)
- `<name>.shared.ts` — platform-agnostic helpers extracted from the divergent module
- `<name>.ts` — thin dispatcher that selects the correct implementation at runtime

Suffixes stack with existing conventions: `shell-path.darwin.pure.ts`, `shell-path.win32.service.ts`, etc.

### Dispatcher pattern

The `<name>.ts` dispatcher is the only file that reads `process.platform`:

```typescript
// electron/backend/environment/shell-path.ts
import { hydrateProcessPath as darwinImpl } from './shell-path.darwin'
import { hydrateProcessPath as win32Impl } from './shell-path.win32'

export function hydrateProcessPath(): Promise<void> {
  if (process.platform === 'win32') return win32Impl()
  if (process.platform === 'darwin') return darwinImpl()
  return Promise.resolve()
}
```

Platform modules export the same function signature. Tests target each platform module directly using its real name (`shell-path.darwin.pure.test.ts` etc.) and never go through the dispatcher.

### chaperone enforcement

New chaperone rule: `process.platform` comparisons are allowed only in:

1. Files whose filename contains `.darwin.`, `.win32.`, `.linux.`, or `.shared.` suffix
2. Files named exactly `<name>.ts` that act as dispatchers for a sibling `<name>.{darwin,win32,linux}.ts`
3. `electron/main/index.ts` (bootstrap, documented exception)

Violations block `chaperone check --fix` and CI.

## Deliverables

### 1. Platform split refactor

Rename and split these existing modules:

| Current file                                              | New files                                                                                                                        |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `electron/backend/environment/shell-path.service.ts`      | `shell-path.ts` (dispatcher), `shell-path.darwin.ts`, `shell-path.win32.ts`, `shell-path.shared.ts`                              |
| `electron/backend/environment/shell-path.pure.ts`         | `shell-path.darwin.pure.ts`, `shell-path.win32.pure.ts`, `shell-path.shared.pure.ts`                                             |
| `electron/main/window-effects.pure.ts`                    | `window-effects.darwin.pure.ts`, `window-effects.win32.pure.ts`, `window-effects.shared.pure.ts`, `window-effects.ts` dispatcher |
| Inline dock/platform branches in `electron/main/index.ts` | Extract to `electron/main/app-chrome.darwin.ts`, `app-chrome.win32.ts`, `app-chrome.ts` dispatcher                               |

New modules:

- `electron/backend/environment/binary-locations.darwin.ts` — macOS fallback install paths (Homebrew, Bun, Cargo, pnpm, JetBrains)
- `electron/backend/environment/binary-locations.win32.ts` — Windows fallback install paths (Git for Windows, `%LOCALAPPDATA%\Programs`, `%APPDATA%\npm`, `%USERPROFILE%\.bun\bin`, `%USERPROFILE%\.cargo\bin`, Scoop shims)
- `electron/backend/environment/binary-locations.shared.ts` — merge/dedup helpers using `path.delimiter`
- `electron/backend/environment/binary-locations.ts` — dispatcher

### 2. Windows PATH resolution

`shell-path.win32.ts` must:

- Skip the interactive-shell probe (no `$SHELL -ilc` equivalent; `process.env.PATH` is already correct on Windows)
- Append Windows fallback entries from `binary-locations.win32`
- Use `path.delimiter` (`;` on Windows) everywhere — never hardcode `:`
- Be a no-op if `process.env.PATH` already contains all fallback entries

### 3. Provider detection

`electron/backend/provider/detect.ts` already branches `where` vs `which`. **Landed 2026-04-18**: `resolveWhichCommand(platform)` in `which-binary.pure.ts` replaces the inline branch; `where` on Windows already honors `PATHEXT` so `.cmd`/`.bat`/`.exe` shims resolve. Version probe and every provider spawn site now pass `shell: needsShellForSpawn(binaryPath, platform)` so Node 20+'s EINVAL on direct `.cmd` exec is avoided.

### 4. electron-builder config

Update `electron-builder.yml`:

```yaml
npmRebuild: true
win:
  icon: build/icon.ico
  target:
    - target: nsis
      arch: [x64]
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  shortcutName: Convergence
```

Flip `npmRebuild: false` → `npmRebuild: true` so `better-sqlite3` rebuilds during packaging on Windows. `asarUnpack: '**/*.node'` is already correct.

### 5. `build/icon.ico`

Generate `build/icon.ico` from the existing `build/icon.icns` source at 16, 32, 48, 64, 128, 256 px. Check into repo.

### 6. `package.json` scripts

Add:

- `package:win` — `electron-vite build && electron-builder --win --x64`
- `package:win:dir` — `electron-vite build && electron-builder --win --dir`

Keep macOS scripts untouched.

### 7. GitHub Actions

New file `.github/workflows/publish-win-release.yml`:

- Triggers: push tags `v*`, `workflow_dispatch` with tag input
- `runs-on: windows-latest`
- Steps mirror `publish-mac-release.yml` with these differences:
  - No signing step (no APPLE_CERTIFICATE etc.)
  - `npm ci` then `npm run package:win`
  - Upload `release/Convergence-*.exe`, `release/*.blockmap`, `release/latest.yml` to the same GitHub Release (`gh release upload --clobber`)
- Version verification step identical to Mac workflow

Update `.github/workflows/ci.yml`:

- Add `windows-latest` to the test matrix for `test:pure` and `test:unit`
- Skip `chaperone check` on Windows only if tooling genuinely does not work there — otherwise run it too
- Do not run Electron-launching e2e on Windows in CI for this phase

### 8. Platform onboarding UI

New slice `src/features/platform-onboarding/`:

- `platform-onboarding.container.tsx` — reads provider detection status from existing entity, gates on `process.platform === 'win32'`, shows banner only when zero providers detected
- `platform-onboarding.presentational.tsx` — renders install-guidance cards for Claude Code (PowerShell / Git Bash install command), Codex CLI, Pi
- `platform-onboarding.copy.ts` — platform-specific copy constants
- Links point to official docs; no in-app installer

Gate by platform using existing `system.getInfo()` IPC call (already exposes `platform`). No new IPC.

### 9. Release docs update

Update `docs/specs/release-distribution-and-changelog.md`:

- Add section "Windows Distribution (Unsigned First)" mirroring "Decision: Unsigned macOS Releases First"
- Document SmartScreen warning tradeoff
- Add Windows scripts to Packaging scripts list
- Update Artifact Strategy to include `.exe` + `latest.yml`

## Testing

### Pure tests

- `shell-path.win32.pure.test.ts` — PATH merge, Windows delimiter, dedup
- `binary-locations.win32.pure.test.ts` — env-var expansion, list stability
- `window-effects.win32.pure.test.ts` — returns correct chrome options without vibrancy fields

### Unit tests

- `shell-path.win32.test.ts` — service exits early if PATH already sufficient, appends fallback otherwise
- `detect.win32.test.ts` — resolves `.exe`, `.cmd`, `.bat` shims
- Dispatcher tests — verify routing per `process.platform` using Vitest module mocking

### Manual smoke matrix on Windows 11

Before merging:

1. Fresh install on Windows 11 with no provider CLIs — onboarding banner renders, install links resolve
2. Install Claude Code via Git Bash — session launches, streams, approval flow works
3. Install Codex CLI — session launches, JSON-RPC handshake completes, approval flow works
4. Create project from a local git repo on `C:\` — SQLite writes to `%APPDATA%\Convergence`
5. Create workspace (git worktree) — worktree path created under `%APPDATA%\Convergence\workspaces\<projectId>\<id>`
6. Run a session that modifies files — changed files panel populates, diffs render
7. Archive / unarchive session — auto-unarchive on actionable attention works
8. Attach an image to a message — ingest, storage, provider-specific serialization succeed
9. Copy `convergence.db` from macOS install → Windows userData folder — app opens, all data visible

### CI gates

- `ci.yml` macOS + Windows matrix passes
- `chaperone check` enforces platform-split rule

## Risks and Open Questions

1. **better-sqlite3 rebuild on windows-latest** — requires MSVC Build Tools; GitHub Actions runner has them preinstalled. If build flakes, document the required Node version alignment with `.nvmrc`.
2. **SmartScreen reputation** — unsigned installer triggers warning on every download. Acceptable for internal/friend distribution per current stance; revisit when moving to broader release.
3. **Windows Defender false positives** — NSIS installers occasionally get quarantined. Document workaround in release notes if it happens.
4. **Long path limits (260 chars)** — worktree paths under `%APPDATA%\Convergence\workspaces\<projectId>\<id>\<repo-subpaths>` can exceed 260. Windows 10+ supports long paths when opt-in group policy enabled. **Partially mitigated 2026-04-18**: `checkWorktreePathLength()` logs a `[workspace]` warning with remediation steps whenever the computed path exceeds `MAX_PATH`. If smoke testing confirms git-level failures, promote the warning to a hard `throw` or introduce `\\?\`-prefixed paths.
5. **Case-insensitive filesystem** — NTFS is case-insensitive by default. Existing code uses `path.join` and does not case-compare, so this should be safe. Audit during smoke test.
6. **Reserved filenames (CON, PRN, AUX, NUL)** — users could create workspace branches with reserved names. **Mitigated 2026-04-18**: `validateBranchNameForPlatform()` in `workspace/branch-name-validation.pure.ts` rejects Windows reserved names (CON, PRN, AUX, NUL, COM1-9, LPT1-9 with or without extension, in any path segment) and segments ending in `.` or ` `. No-op on non-Windows hosts so Mac behavior is unchanged.
7. **CRLF vs LF** — Git on Windows typically sets `core.autocrlf=true`. Diffs rendered in the changed-files panel may show CRLF noise. **Mitigated 2026-04-18**: repo-root `.gitattributes` sets `* text=auto eol=lf` so checkouts normalize to LF on all platforms. Document known limitation if it re-surfaces; revisit only if users complain.
8. **`.gitattributes` in repo** — **Done 2026-04-18**: added `* text=auto eol=lf` plus binary declarations for `*.png`, `*.ico`, `*.icns`, `*.dmg`, `*.exe`, `*.node`, `*.wasm`, etc.
9. **`npmRebuild: false` in `electron-builder.yml`** — retained from macOS flow. Mac packaging relies on the pre-step `electron-rebuild --force -o better-sqlite3` inside `npm run build`. Same command runs on Windows too. If `better-sqlite3` fails to load from the packaged Windows installer in the smoke matrix, flip `npmRebuild` to `true`.

## Implementation Order

1. chaperone rule + platform-split convention documented (no code change)
2. Extract `binary-locations.shared.ts` + `.darwin.ts` + `.win32.ts` + dispatcher
3. Split `shell-path.*` files
4. Split `window-effects.*` and `app-chrome.*` files
5. Add `win:` block to `electron-builder.yml`, add `build/icon.ico`, add `package:win` script
6. Run `npm run package:win` on a local Windows machine or CI, fix issues
7. Add `publish-win-release.yml`
8. Add Windows runner to `ci.yml`
9. Build `platform-onboarding` slice
10. Run manual smoke matrix on Windows 11
11. Update `release-distribution-and-changelog.md`
12. Tag a release, verify end-to-end publish

## Non-Negotiables

- No `process.platform` checks outside dispatchers and platform-suffixed files after this phase lands
- No silent `if (process.platform === 'darwin') return` bailouts — every platform-specific code path has a named sibling for the other platform (even if the sibling is a documented no-op)
- `chaperone check` stays green
- macOS behavior must not regress — every existing Mac test continues to pass unchanged
