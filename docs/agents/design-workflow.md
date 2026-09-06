# Design collaboration outside the execution loop

This is the operating companion to [DESIGN.md](../../DESIGN.md). Marcin
ratified the design role on 2026-09-06 and Fable integrated it the same day.

## Parallel work, explicit handoff

Marcin and the Design Director explore in the Codex desktop app. Fable and
the executors build and review through Convergence's existing run and relay
process. Design work may continue while a run is active. The Design Director
does not participate in automatic baton routing, take an ARMED row, or edit
the dispatch board. A ready design brief waits for Fable's grooming and
Marcin's prioritization; it is not automatically the next run.

The usual sequence is:

1. Understand a user problem and the existing experience.
2. Explore enough distinct approaches to resolve the real uncertainty.
3. Discuss the recommendation with Marcin; record exactly what he ratifies.
4. Prepare a compact Linear design brief with selected Figma references.
5. Fable examines domain and technical implications, resolves questions with
   Marcin and the Design Director, and prepares the implementation run.
6. The existing executor/reviewer/Fable loop implements and settles that run.
7. When useful, the Design Director compares the result with the intended
   experience. Fable settles findings; Marcin supplies the feel verdict.

Small, understood work does not require a design pass. A capability question
may warrant an early conversation with Fable before detailed visual work.

## What belongs where

| Location                    | Responsibility                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| Figma                       | Visual alternatives, selected references, reusable design elements, optional prototypes     |
| Linear, project convergence | Feature briefs, decisions, open questions, implementation tickets, run and release evidence |
| Repository                  | Role charter, collaboration conventions, durable architecture and domain knowledge          |
| Running app and source      | Evidence of actual implementation, with version or commit when known                        |

Existing Figma file: [Convergence — App UI](https://www.figma.com/design/nizmdlM7yENFDQ4XQuFwoN/Convergence-App-UI).
The [coverage guide](https://www.figma.com/design/nizmdlM7yENFDQ4XQuFwoN/Convergence-App-UI?node-id=45-2423)
describes the initial reference collection and its limits. Its counts describe
that snapshot, not a permanent parity claim. Inter currently substitutes SF Pro.

## Design references and revisions

Keep current-app references separate from explorations. Label reconstructed
states and simulated prototype behavior. Organize explorations around the
question being answered, with the recommendation and its rationale visible.

When Marcin selects a direction, the Linear brief names the exact frames and
a revision/date. Preserve a dedicated selected copy of those frames. Before
dispatch, ensure its underlying component dependencies cannot change silently:
use independent copies of those dependencies or detached selected instances,
and retain an export as a visual record where useful. A new frame that still
inherits a changing shared component is not a frozen reference.

After dispatch, do not edit that selected reference. New ideas get another
revision in the exploration area. A requested change to active work is routed
to Fable under the existing correction law. An old direction remains readable
as history and is marked superseded by the newer brief revision.

The connection to code is deliberately loose. Link relevant source paths or
known capabilities when they explain a constraint, but do not force one-to-one
component mapping. Do not install or set up Code Connect or automatic syncing
without a later explicit change to this agreement.

## Experience promises and technical choices

The brief distinguishes behavior that must survive implementation from choices
Fable may make. For example: “show the destination before send and never
silently substitute another destination” is an experience promise. The storage
model and service decomposition belong to technical grooming. A proposed
change to domain meaning must be identified, not smuggled in through UI copy.

Fable can return a concrete contradiction or feasibility question. The Design
Director explains the intent and explores alternatives; Marcin resolves the
experience decision. Neither role silently overrules the other or sends
competing instructions to an executor.

## Honest delivery state

Design readiness and implementation progress are separate facts. A selected
design is not a dispatched run; a PR is not a released feature; a mapped screen
is not evidence of parity. The brief links to Fable's tickets and run once
they exist. Implementation/release status remains with those records rather
than a second manually maintained Figma delivery board.

Design review, when requested, names the relevant frame/revision, the observed
build, the concrete mismatch, its user consequence, and whether it violates
the selected intent or is merely a new suggestion. Fable adopts, disputes,
or defers it. New ideas do not silently expand the active run. Marcin's verdict
is recorded as his verdict, never inferred from tool checks.

## Instructions and ownership

`AGENTS.md` routes agents to their assigned role. It does not make every Codex
session a designer. `CLAUDE.md` already imports `AGENTS.md`, so it needs no
duplicate charter. Fable owns updates to its local `FABLE.md`, `HANDOFF.md`,
memory, and dispatch instructions. The Design Director supplies proposed
wording and a handoff rather than editing those private records.

Documentation the Design Director prepares for the repository is handed to
Fable for review and repository delivery unless Marcin assigns delivery
ownership differently for that task; the general PR terminal rule is not a
request to commit or push a handoff independently.
