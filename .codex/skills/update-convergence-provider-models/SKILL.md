---
name: update-convergence-provider-models
description: Use when updating Convergence's built-in provider model catalogs, especially Codex/OpenAI or Claude Code/Anthropic defaults, fallback model lists, effort metadata, context windows, or guided-review model preferences after a provider releases new models. This skill is repo-specific to Convergence and should be used for requests like "update the Codex provider models", "refresh OpenAI model list", "Anthropic released a new Claude model", or "make Convergence use the latest Claude Code model".
---

# Update Convergence Provider Models

This skill is only for the Convergence repository. It preserves the workflow for refreshing provider model catalogs after OpenAI/Codex or Anthropic/Claude Code model releases.

## Ground Rules

- Research first, edit second, verify third.
- Use only official provider sources for current model facts:
  - OpenAI/Codex: OpenAI developer docs, OpenAI platform docs, or current Codex CLI/provider-advertised metadata.
  - Anthropic/Claude Code: Anthropic docs, Claude Code docs, or current Claude Code/provider-advertised metadata.
- Do not invent model ids, aliases, context windows, reasoning efforts, modalities, or release status.
- Keep changes narrow to active provider defaults, fallback model catalogs, directly related preferences, and focused tests.
- Do not rewrite historical analytics/session fixtures, changelog entries, or migration examples unless a test intentionally asserts the current provider catalog.
- Respect `AGENTS.md`: use the Node version from `.nvmrc` and run the required verification commands before finishing.

## Locate The Provider Surface

Start with:

```bash
rg -n "buildFallbackCodexDescriptor|buildClaudeDescriptor|preferredGuidedReviewModelId|gpt-|claude-|sonnet|opus|haiku" apps/convergence/electron apps/convergence/src
```

Primary files (relative to the `apps/convergence` workspace):

- `electron/backend/provider/provider-descriptor.pure.ts`
  - `buildFallbackCodexDescriptor()` owns Codex/OpenAI fallback model options.
  - `buildClaudeDescriptor()` owns Claude Code aliases and pinned Anthropic model ids.
- `electron/backend/app-settings/app-settings.pure.ts`
  - `preferredGuidedReviewModelId()` owns provider-specific guided review preferences.
- `src/features/app-settings/guided-review-model-defaults.presentational.tsx`
  - mirrors guided-review picker defaults in the settings UI.
- `electron/backend/provider/provider-descriptor.pure.test.ts`
  - add or update focused tests for catalog ordering, defaults, and key metadata.
- `electron/backend/app-settings/app-settings.service.test.ts`
  - update tests that assert guided-review defaults.

Also check nearby focused tests with `rg` before editing:

```bash
rg -n "gpt-|claude-|guided review|defaultModelId|fastModelId" apps/convergence/electron/backend apps/convergence/src/features apps/convergence/src/entities
```

## OpenAI / Codex Workflow

1. Use the `openai-docs` skill for current OpenAI model guidance when available.
2. Fetch official OpenAI model guidance before editing. Prefer:
   - `https://developers.openai.com/api/docs/guides/latest-model`
   - `https://platform.openai.com/docs/models`
   - current Codex CLI/provider `model/list` metadata when available in this repo's adapter path.
3. Remember that `CodexProvider.fetchDescriptor()` asks Codex CLI for `model/list` and uses `buildFallbackCodexDescriptor()` only when discovery fails or returns no usable models. Keep fallback metadata current, but do not remove the RPC discovery behavior.
4. Update `buildFallbackCodexDescriptor()`:
   - put newest recommended model family first;
   - set `defaultModelId` to the provider-recommended general/default model;
   - set `fastModelId` only to a real model in `modelOptions`;
   - include only verified `effortOptions`, `defaultEffort`, `contextWindowTokens`, and `inputModalities`;
   - keep older or specialized coding-agent models when they are still valid compatibility options.
5. Update Codex guided review preference only when the new model is suitable for code review generation.

## Anthropic / Claude Code Workflow

1. Use official Anthropic or Claude Code sources before editing. If source facts are not clear, stop and report the uncertainty instead of guessing.
2. Update `buildClaudeDescriptor()`:
   - keep user-facing aliases such as `best`, `fable`, `sonnet`, `opus`, and `haiku` only if they remain meaningful for Claude Code;
   - add pinned model ids for new official models when available;
   - update `defaultModelId` and `fastModelId` only when the provider guidance justifies it;
   - keep effort options aligned with what Claude Code supports for that model family;
   - keep context window metadata only when verified.
3. Update guided-review preference if the best Claude Code review model changes.

## Test Strategy

Add or update focused expectations instead of mass-replacing model strings.

Preferred tests:

- provider descriptor test asserts the provider's default model, fast model, ordered model ids, and key metadata for the newest model family;
- app settings service test asserts guided-review defaults;
- UI/default-picker test only when the selected model fallback logic changed.

Avoid broad fixture churn:

- analytics fixtures may keep old model ids as historical sample data;
- session fixtures may keep old model ids as arbitrary user selections;
- changelog and generated release notes should not be edited for a model catalog refresh.

## Verification

Run every repo-required command under the Node version from `.nvmrc`:

```bash
fnm exec --using "$(cat .nvmrc)" npm install
fnm exec --using "$(cat .nvmrc)" npm run typecheck
fnm exec --using "$(cat .nvmrc)" npm run test:pure
fnm exec --using "$(cat .nvmrc)" npm run test:unit
fnm exec --using "$(cat .nvmrc)" chaperone check --fix
```

If `fnm` is unavailable, use the installed Node version manager that can run `.nvmrc` exactly. If the required Node version is unavailable, report that explicitly.

Do not run `npm run dev` in this repo.

## Final Response

Summarize:

- official sources used;
- provider defaults changed;
- model ids added, retained, or removed;
- tests and verification results;
- any uncertainty about provider availability or rollout.
