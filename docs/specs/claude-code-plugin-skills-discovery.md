# Claude Code Plugin Skills Discovery

Companion fix to `docs/specs/first-class-skills-phase-5.md`. Captures the
discovery contract for Claude Code plugin skills so the Convergence catalog
matches what the real Claude Code harness sees.

## Problem

`electron/backend/skills/claude-code-skills.service.ts` (pre-fix) assumed
plugins live directly under `~/.claude/plugins/{plugin}/skills/`. Real Claude
Code installs plugins into a cache and tracks them in a manifest:

- Cache layout: `~/.claude/plugins/cache/{marketplace}/{plugin}/{version}/skills/`
- Manifest: `~/.claude/plugins/installed_plugins.json` with v2 schema
  `{ version: 2, plugins: { "<plugin>@<marketplace>": [{ scope, installPath, version, ... }] } }`

Top-level entries under `~/.claude/plugins/` are the runtime's bookkeeping
files (`cache`, `data`, `marketplaces`, `repos`, `installed_plugins.json`,
etc.) — not plugin roots — so the old discovery returned zero plugin skills.
Result: only `~/.claude/skills/{name}/SKILL.md` (user scope) surfaced.

## Source-of-Truth Research

- `~/.claude/plugins/cache` is the only path acknowledged in public docs
  (Discover-plugins troubleshooting: "Clear the cache with `rm -rf
~/.claude/plugins/cache`").
- Internal cache nesting (`cache/{marketplace}/{plugin}/{version}/`) is
  observed but not contractual.
- `installed_plugins.json` is a real file with a versioned schema. Anthropic
  has not promoted it as a public API; GitHub issue #15754 confirms even
  Claude itself cannot reliably find plugin paths today.
- Codex publishes documented filesystem scopes and Convergence already
  delegates Codex skill listing to its app-server `listSkills` RPC. No change
  needed.
- Pi follows Convergence's own `first-class-skills-phase-5.md` spec.
  Filesystem layout is internal but authoritative for Pi. No change needed.

## Decision

Discovery for Claude Code plugins uses **manifest-first, cache-walk
fallback**:

1. **Manifest first.** Read `~/.claude/plugins/installed_plugins.json` and any
   ancestor `<project>/.claude/plugins/installed_plugins.json`. For every
   plugin record, treat `installPath + /skills` as a discovery root tagged
   `plugin`. The manifest's `version` field lets us bail out cleanly if
   Anthropic ever changes the schema.
2. **Fallback when no manifest.** Recursively walk `~/.claude/plugins/cache/`
   and any project `<project>/.claude/plugins/cache/` looking for any
   directory containing a `skills/` subdirectory. Stop descending once a
   `skills/` directory is found. Depth-limited to 5 to bound I/O.
3. **Documented user/project scopes are unchanged.**
   - `~/.claude/skills/{name}/SKILL.md` → user
   - `<repo>/.claude/skills/{name}/SKILL.md` walked up to filesystem root → project

The manifest path is authoritative when present. The fallback exists for
fresh setups, partial states, or future schema breakage.

## Codex and Pi

- Codex stays on `CodexAppServerClient.listSkills()` RPC. The Codex
  documentation (`developers.openai.com/codex/skills`) lists filesystem
  scopes for completeness, but the RPC delegates discovery to Codex itself,
  which is the only stable contract.
- Pi remains filesystem-based per `first-class-skills-phase-5.md`. Custom
  provider, custom contract.

## Acceptance Criteria

- [ ] Plugins listed in `~/.claude/plugins/installed_plugins.json` surface
      their `skills/{name}/SKILL.md` entries as Claude Code skills with the
      `plugin` scope.
- [ ] When the manifest is absent, plugin skills are still discovered via the
      cache walk under `~/.claude/plugins/cache/`.
- [ ] User skills (`~/.claude/skills/`) and project skills
      (`.claude/skills/` walked up to root) continue to surface unchanged.
- [ ] Manifests with non-v2 `version` values, malformed JSON, or missing
      `installPath` fields are ignored without throwing.
- [ ] Cache walk depth is bounded so a deep accidental directory cannot stall
      the catalog refresh.

## Verification

- [ ] `npm install`
- [ ] `npm run typecheck`
- [ ] `npm run test:pure`
- [ ] `npm run test:unit`
- [ ] `chaperone check --fix`

## Files Touched

- `electron/backend/skills/claude-code-skills.service.ts`
- `electron/backend/skills/claude-code-skills.service.test.ts`
- `docs/specs/claude-code-plugin-skills-discovery.md` (this file)
