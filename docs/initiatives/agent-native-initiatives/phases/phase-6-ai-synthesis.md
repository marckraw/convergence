# Phase 6: AI Synthesis As Suggested Updates

## Product Goal

Add the first AI-assisted Initiative action: synthesize the Initiative's current
understanding from linked Attempts, existing stable state, and known Outputs.

The action must create reviewable suggested updates. It must not silently mutate
the Initiative.

## Current Repo State

- Initiatives, Attempts, and Outputs are persisted through
  `InitiativeService`.
- The Workboard is the main Initiative detail surface.
- Session fork preview already uses provider-neutral `Provider.oneShot` with a
  strict JSON prompt, validation, and retry.
- Renderer Initiative state lives in `src/entities/initiative` and is exposed to
  features through the entity API/store.
- Output discovery suggestions are transient in the Workboard until accepted.

## Current Research

Current provider docs for structured output recommend schema-constrained JSON
when direct APIs support it. Convergence should apply the same product contract
locally through strict JSON prompting, validation, and one retry because
Initiative synthesis must run through existing provider CLIs/harnesses instead
of direct model API requests.

## Contracts

- Backend adds a synthesis service that calls `Provider.oneShot`.
- The service picks a linked non-shell Attempt with one-shot support, preferring
  the primary Attempt.
- Prompt input includes:
  - Initiative title, status, attention, and current understanding
  - linked Attempt metadata
  - existing Outputs
  - serialized transcripts for linked Attempts
- Provider response must validate as JSON with:
  - `current_understanding`
  - `decisions`
  - `open_questions`
  - `next_action`
  - `outputs`
- Renderer shows a transient synthesis preview.
- Accepting current understanding updates the local draft only; the existing
  Save button persists it.
- Accepting an output suggestion creates a stable Output immediately, matching
  existing output suggestion behavior.
- Rejecting/dismissing clears transient suggestions only.

## Out Of Scope

- Durable suggestion inbox.
- Accepted decisions/open-questions tables.
- Direct OpenAI/Anthropic API integration.
- Long-running autonomous Initiative agents.

## Tests

- Pure prompt assembly and response validation.
- Backend service with mocked provider `oneShot`, including retry.
- Workboard preview rendering, accept/edit/reject behavior, and output accept.
- Store/API wiring for synthesis.

## Manual Check

Run `npm run dev`, then verify:

1. Open an Initiative with at least one linked conversation Attempt.
2. Click **Synthesize** near Current understanding.
3. Confirm suggestions appear without changing the stable text automatically.
4. Edit the suggested Current understanding and accept it.
5. Save the Initiative and reopen it.
6. Run synthesis again and dismiss the preview.
7. Confirm dismissed suggestions do not persist.
8. If output suggestions appear, accept one and confirm it becomes a stable
   Output.
