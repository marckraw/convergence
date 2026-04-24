# Phase 7: V1 Hardening And End-To-End Review

## Product Goal

Make the Initiative V1 flow cohesive enough for regular use across tiny and
larger agent-driven work.

The phase should focus on reliability and clarity rather than adding a new
product surface.

## Current Repo State

- Users can create global Initiatives from the Workboard.
- Sessions can be linked as Attempts and shown in both the Workboard and
  session context panel.
- Outputs can be added manually and suggested from local branch state.
- AI synthesis can propose current understanding, decision-like bullets, open
  questions, next action, and output suggestions.
- Only Current understanding and Outputs have persisted stable state in V1.

## Current Research

No new external research is needed for this phase. This is repo- and
product-flow hardening based on the implemented V1 surfaces.

## Contracts

- Keep Initiatives global and session navigation unchanged.
- Keep Current understanding as the stable text container for V1.
- Do not introduce durable Decisions/Open questions/Next action tables in this
  phase.
- Add a lightweight promotion path for synthesis notes that do not have their
  own stable schema yet:
  - Decisions
  - Open questions
  - Next action
- Persist promoted notes only through the existing Save action.

## Out Of Scope

- New database schema for decisions/questions/next action.
- Activity timeline.
- Provider detection improvements beyond the existing provider runtime path.
- GitHub PR lifecycle automation.

## Tests

- Workboard component coverage for promoting synthesis notes into Current
  understanding.
- Container coverage that promoted synthesis notes are saved through the normal
  Initiative update path.
- Keep existing cross-project, output, and synthesis coverage passing.

## Manual Check

Run `npm run dev`, then verify:

1. Create or open an Initiative with a linked Attempt.
2. Run synthesis.
3. Accept or edit the proposed Current understanding.
4. Use the promotion action for Decisions/Open questions/Next action.
5. Confirm those notes appear in Current understanding as editable text.
6. Save, close, reopen, and confirm only the accepted/promoted text persisted.
7. Confirm dismissing a synthesis preview leaves no new stable state.
