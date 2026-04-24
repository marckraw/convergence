# Phase 8: Manual Initiative Attention

## Product Goal

Make Initiatives easier to scan by letting the user set the attention flag
directly.

The backend model already supports Initiative attention. The Workboard already
shows attention badges, but V1 does not expose a way to change them. This phase
closes that loop without adding automatic detection or workflow rules.

## Current Repo State

- Initiatives have `attention` in the backend, preload API, renderer entity,
  and store update contract.
- The Workboard shows a badge when attention is not `none`.
- The Workboard detail form currently edits title, status, and Current
  understanding.
- Product spec says user-set attention is acceptable; perfect automated
  attention detection remains out of scope.

## Current Research

No external research is needed. This phase is grounded in existing Convergence
domain state and UI patterns.

## Contracts

- Add `attention` to the Workboard draft state.
- Save attention through the existing Initiative update path.
- Keep attention separate from status:
  - status tracks delivery journey
  - attention tracks what needs human focus
- Do not infer attention automatically from sessions in this phase.
- Do not add new notification behavior or sidebar buckets for Initiatives.

## Out Of Scope

- Automatic stale/blocked/needs-you detection.
- Durable activity timeline entries for attention changes.
- Workboard filtering/grouping by attention.
- Notifications for Initiative attention.

## Tests

- Update Workboard container coverage to save attention.
- Update Workboard presentational coverage to emit attention draft changes.
- Keep existing synthesis, Attempt, and Output coverage passing.

## Manual Check

Run `npm run dev`, then verify:

1. Open the Initiatives Workboard.
2. Select an Initiative.
3. Change Attention to `Needs decision`, `Blocked`, or `Stale`.
4. Save, close, reopen, and confirm the attention badge persists.
5. Change Attention back to `No attention`, save, and confirm the badge is no
   longer shown in the Initiative list.
