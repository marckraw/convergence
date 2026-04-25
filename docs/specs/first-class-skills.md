# First-Class Skills

## Objective

Convergence should make agent skills discoverable, understandable, and
invokable from a UI-first product surface while staying as close as possible to
each provider's native skill system.

Terminal harnesses expose skills through prompt syntax (`$skill` in Codex,
slash commands in Claude Code and Pi). That is acceptable for terminal users
but weak for Convergence because the user cannot easily answer:

- Which skills are available for this project and provider?
- What does each skill actually do?
- Is this a global skill, project skill, bundled skill, plugin skill, or
  provider system skill?
- What tools, MCP servers, apps, scripts, or setup does the skill depend on?
- Did Convergence merely send the skill request, or did the provider confirm
  that the skill was activated?

V1 should solve discovery and explicit invocation. It should not become an
independent skill runtime.

## Sources

- Codex app-server skills protocol:
  `https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md`
- Codex skills docs: `https://developers.openai.com/codex/skills`
- Claude Code skills docs:
  `https://docs.claude.com/en/docs/claude-code/skills`
- Claude Code OpenTelemetry monitoring:
  `https://code.claude.com/docs/en/monitoring-usage`
- Pi skills docs:
  `https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md`
- Related Convergence spec: `docs/specs/mcp-server-visibility.md`

## Product Principles

1. Provider-native first.
   Convergence should use each provider's catalog and invocation mechanism when
   it exists. It should not copy full skill instructions into prompts as the
   default path if the provider has a native skill input or native skill command.

2. UI solves discoverability, not syntax memorization.
   The primary user surface is a skill picker and skill browser, not a slash
   command prompt clone.

3. Skills and tools are related but not the same.
   Skills can reference tools, MCP servers, apps, scripts, or CLIs, but the UI
   must not merge skill catalogs into the MCP/tool catalog. It should show
   dependencies and readiness alongside skill details.

4. Runtime truth must be explicit.
   Convergence may show "selected" and "sent" when it controls those states.
   It may show "confirmed" only when the provider emits a native activation
   signal. Do not infer activation from model text, filenames, tool calls, or
   logs.

5. Details matter.
   A skill row is not enough. Users need full `SKILL.md` detail, path/source,
   provider compatibility, dependencies, and conflict information before they
   can trust a large skill catalog.

## Definitions

- **Skill:** A provider-discovered capability package, normally backed by a
  `SKILL.md` file plus optional scripts, references, and assets.
- **Skill catalog entry:** Normalized metadata Convergence displays for one
  provider-visible skill. Duplicate skill names are allowed and must be
  disambiguated by provider, scope, source, and path.
- **Skill selection:** A user-chosen skill reference attached to a turn before
  submission.
- **Skill invocation:** The provider-native input Convergence sends for a
  selected skill.
- **Skill activation:** A provider-confirmed runtime event that a skill was
  invoked/activated by the agent.
- **Scope:** Where the provider loaded the skill from. Convergence normalizes
  scope for display only; the provider remains the source of truth.

## Scope Model

The UI should show normalized scope labels while retaining provider-specific
raw scope/source fields.

- **Product/System:** Bundled with a provider, plugin, marketplace, or
  Convergence-managed distribution. Usually read-only.
- **Global/User:** Available across projects for the current user.
- **Project/Repo:** Available because of the selected project root or ancestor
  directory.
- **Plugin/Admin/Team:** Available because a provider plugin, marketplace, team
  config, or admin config provided it.
- **Extra/Settings:** Loaded from explicit provider settings, package metadata,
  or provider-specific additional roots.

Known provider mappings:

- Codex app-server returns provider-owned `scope` and source metadata. Preserve
  those raw values and map them to the labels above.
- Claude Code documents user, project, and plugin skills. If a future native
  catalog API returns richer values, prefer it over filesystem inference.
- Pi documents global roots, project roots, package-provided skills, settings
  entries, and explicit `--skill` paths.

## Provider Behavior Matrix

| Provider    | Catalog strategy                                                                                                                                                                                              | Invocation strategy                                                                                                                            | Activation confirmation                                                                                                                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Codex       | Use `codex app-server` `skills/list`; listen for `skills/changed`; later use `skills/config/write` for enable/disable.                                                                                        | Add both a text marker and a structured `{ type: "skill", name, path }` user input item to `turn/start.input`.                                 | No stable activation event found in app-server docs or current Convergence notification handling. V1 shows `sent`, not `confirmed`.                                                                                                                   |
| Claude Code | Prefer any native CLI/SDK catalog API if it becomes available. Until then, perform a read-only scan of documented `.claude/skills` user/project/plugin locations and mark the catalog source as `filesystem`. | Use the provider-native skill command in the prompt where supported. Avoid copying full `SKILL.md` into the prompt as the normal path.         | Claude Code documents OpenTelemetry event `claude_code.skill_activated` with `skill.name`, `skill.source`, plugin, and marketplace attributes. Current Convergence stdout stream does not include this. A later telemetry phase can show `confirmed`. |
| Pi          | Prefer a native RPC/catalog command if one appears. Until then, use documented Pi discovery roots and settings as a read-only catalog.                                                                        | Use `/skill:name` for prompt-time invocation. For future new-session-only flows, `--skill <path>` can be considered for explicit path loading. | Pi docs describe skill loading and `/skill:name`, but current RPC events handled by Convergence do not expose a stable skill activation event. V1 shows `sent`, not `confirmed`.                                                                      |

## UI Behavior

### Composer Entry Point

Add a compact Skills button in the composer toolbar. It opens a searchable
popover scoped to the active provider by default.

The popover should include:

- search input
- active provider filter
- skill rows with name, short description, scope badge, provider badge, and
  warning badges for disabled, unavailable, duplicate, or dependency issues
- selected state and remove action
- "Browse all skills" action for the full browser

Selecting a skill adds a chip to the composer. The chip should show the skill
name and provider/scope when needed to disambiguate. Removing the chip removes
the selection before send.

### Skill Browser

Add a full Skills dialog for discovery and understanding. It can be opened from
the composer popover first; later it can also be exposed through Cmd+K or a
project footer action.

The browser should include:

- provider-grouped skill catalog
- search across name, description, provider, scope, and path
- filters for provider, scope, enabled state, dependency state, and duplicates
- detail pane with:
  - provider display name
  - skill name and normalized scope
  - raw provider source/scope
  - path to `SKILL.md`
  - description and short description
  - full `SKILL.md` rendered as Markdown
  - resources/scripts/assets summary
  - dependencies and readiness
  - provider-specific invocation notes
  - read-only/editable state

V1 should be read-only except Codex enable/disable if that is cheap and uses
`skills/config/write`. Editing, marketplace browsing, skill creation, and
install flows are future work.

### Transcript State

When a turn is sent with selected skills, the user message should keep the
skill refs in normalized conversation item metadata.

Display labels:

- `selected`: in composer before send
- `sent`: provider accepted the turn with the selected skill reference
- `confirmed`: provider emitted a native activation event for that skill
- `unavailable`: selected skill could not be resolved at send time
- `failed`: provider rejected the skill invocation or Convergence failed to
  serialize it

Do not label a skill as `using`, `used`, or `activated` unless the provider
confirmed it.

## Architecture

### Backend Domain

Add a backend skills domain under `electron/backend/skills`.

Suggested files:

- `skills.types.ts`
- `skills.service.ts`
- `skill-paths.pure.ts`
- `skill-frontmatter.pure.ts`
- `skill-details.service.ts`

Provider-specific catalog adapters may live under each provider directory or
under `electron/backend/skills/providers` if sharing is low:

- `codex-skills.service.ts`
- `claude-code-skills.service.ts`
- `pi-skills.service.ts`

Suggested normalized types:

```ts
export type SkillProviderId = 'codex' | 'claude-code' | 'pi'

export type SkillScope =
  | 'product'
  | 'system'
  | 'global'
  | 'user'
  | 'project'
  | 'plugin'
  | 'admin'
  | 'team'
  | 'settings'
  | 'unknown'

export type SkillInvocationStatus =
  | 'selected'
  | 'sent'
  | 'confirmed'
  | 'unavailable'
  | 'failed'

export interface SkillRef {
  providerId: SkillProviderId
  name: string
  path: string | null
  scope: SkillScope
  rawScope: string | null
}

export interface SkillCatalogEntry extends SkillRef {
  id: string
  displayName: string
  description: string
  shortDescription: string | null
  enabled: boolean
  sourceLabel: string
  dependencies: SkillDependency[]
  warnings: SkillWarning[]
}

export interface SkillSelection {
  ref: SkillRef
  argumentText?: string
}
```

Do not use `name` as a unique key. Use a stable ID derived from provider,
scope/source, and path when path is available.

### Provider Capability

Extend `ProviderDescriptor` with a skills capability summary so the renderer can
explain provider differences without hardcoding them:

```ts
skills: {
  catalog: 'native-rpc' | 'native-cli' | 'filesystem' | 'unsupported'
  invocation: 'structured-input' | 'native-command' | 'unsupported'
  activationConfirmation: 'native-event' | 'none'
}
```

This is descriptive capability metadata. Actual listing and invocation should
flow through backend services and provider adapters.

### IPC

Expose a thin IPC boundary:

- `skills:listByProjectId(projectId, options)`
- `skills:readDetails(input)`
- `skills:refresh(projectId, options)`
- future: `skills:setEnabled(input)`

The renderer must not read arbitrary local paths directly. `readDetails` should
only accept a catalog entry ref returned by `listByProjectId`, or validate that
the requested path is under a known provider skill root for the selected
project/provider.

### Runtime Invocation

Extend session start and send-message inputs with skill selections:

- `SessionStartConfig.skillSelections?: SkillSelection[]`
- `SessionHandle.sendMessage(text, attachments, skillSelections?)`
- IPC `session.start` / `session.sendMessage` include `skillSelections`
- renderer `session.api.ts` and `session.model.ts` forward them
- `ProviderSessionEmitter.addUserMessage` includes `skillRefs` on user message
  items

Update conversation item types so user message payloads can persist selected
skills alongside `attachmentIds`.

Codex implementation should update `CodexUserInput` to include:

```ts
{
  type: 'skill'
  name: string
  path: string
}
```

Claude Code and Pi implementations should format provider-native command text
without modifying visible transcript text unexpectedly. If the visible prompt
contains a native marker because the provider requires it, the transcript can
show both the user's original text and skill chips so the turn remains
auditable.

### Renderer Slices

Follow FSD-lite:

- `src/entities/skill`
  - `skill.types.ts`
  - `skill.api.ts`
  - `skill.model.ts`
  - `index.ts`
- `src/features/skills`
  - browser dialog container/presentational
  - composer picker container/presentational
  - details presentational
  - pure filters/ranking utilities
- `src/features/composer`
  - owns composer integration and passes selected skills to session model
- `src/widgets/session-view`
  - renders skill chips on user messages

Presentational components should remain render-only. Provider calls and file
reads stay behind entity API/model or backend IPC.

## Dependency And Readiness Model

V1 should parse and display dependencies when the provider catalog exposes
them. For Codex this includes app-server skill metadata and dependency fields.
For filesystem-scanned providers, only safe static information from
frontmatter, known files, and obvious resource directories should be shown.

Dependency labels should be conservative:

- `declared`
- `available`
- `needs-auth`
- `needs-install`
- `unknown`

MCP and app dependencies should link mentally to `docs/specs/mcp-server-visibility.md`,
but the skill browser should not become the MCP configuration UI.

## Security And Safety

- Listing skills must not execute skill scripts.
- Reading details must be path-restricted to provider skill roots.
- Full `SKILL.md` display may contain arbitrary Markdown; render it with the
  existing safe Markdown path and do not execute embedded HTML/scripts.
- Treat external skill content as untrusted local content.
- Do not auto-install dependencies during catalog browsing.
- Do not mutate provider config unless the user triggers an explicit action and
  the provider exposes a native config API.

## Non-Goals For V1

- Skill marketplace browsing
- skill installation
- skill creation/editing
- cross-provider skill sync
- Convergence-owned skill runtime
- automatic skill recommendation engine
- heuristic "used skill" detection
- automatic MCP/app auth flows from the skill browser

## Open Questions

- Should selected skills be per-turn only in V1, or should sessions support
  sticky selected skills? Recommendation: per-turn only for V1.
- Should Codex enable/disable be included in V1? Recommendation: only if the
  native app-server call is already available and covered by tests.
- How should Claude duplicate names be handled when native invocation accepts
  only a name? Recommendation: show a warning and use provider resolution; do
  not pretend Convergence can force a path unless the provider exposes that.
- Should Convergence run an embedded OTel collector for Claude activation
  events? Recommendation: defer to the telemetry phase after the basic catalog
  and invocation path works.
