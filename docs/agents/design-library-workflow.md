# Maintaining the Convergence design workspace

Read DESIGN.md and design-workflow.md first. This workflow governs deliberate maintenance of the app/Figma relationship; it does not establish automatic synchronization or one-to-one code/component mappings.

## Find the reference

Start at Figma file `nizmdlM7yENFDQ4XQuFwoN`, page `14:785` (Start here). Its directory identifies maintained component families, screen examples, exploratory work and frozen references. Prefer exact node links over page numbers or search-result names. A page called Current is not proof of parity: inspect its verification date, source commit and limits.

For each family maintain a visible record: human name; code symbols and repository paths; component node links; screen-instance links; observed app version/commit and date; design status; coverage and limitations. Keep observed implementation and approved-but-unimplemented design separate. Put product decisions and rollout work in Linear, operating knowledge here.

Read [the library directory](design-library/README.md) and its full inventory before creating components. The inventory is a dated discovery snapshot, not a declaration that every definition matches the installed app. Resolve the exact IDs live before reuse. Do not select by a page title containing “Current” alone.

The conversation pilot starts at page `594:2821`. Activity card set `597:38613` (default `595:1294`), project card set `594:4095`, and capability comparison board `618:36941`. The Activity card owns its content and action controls directly; the former separate body set and review-actions master were removed during consolidation.
The directory frame is `600:2`; family guide `599:2668`. The preferred editable
conversation screen is `693:711` on page `692:2`; consult its explicit desktop
scope and remaining parity gaps in the directory. The earlier context
`597:38615` on page `597:38614` is historical: nine conversation instances over
screenshot-backed surroundings. Never reuse it as a new design baseline.
Other screens are not migrated by this pilot. Earlier page `299:2` remains a
historical dependency source; do not assume all its contents are current.

## Explore

Inspect the relevant running app surface, renderer code, maintained component, and screen context before changing a design. Record missing facts rather than inventing a tidy state. Preserve real metadata, distinct controls, loading/failure/empty behavior and long-content density unless their change is explicitly part of the proposal.

Use maintained instances for unchanged surroundings. For the part being redesigned, create independent experimental components or detached copies on a named Exploration page. A cloned frame containing instances is NOT isolated from those masters. Audit nested instances, styles and variables: copy the dependencies being changed, or detach/unbind those dependencies in the experiment. Do not edit canonical tokens to try an idea. Exploration may depart substantially from existing components; reuse is context, not a restriction on creativity.

Label each experiment with its question, provenance, changed scope and known limits. Screenshots are comparison evidence outside the product frames only. Never put a screenshot behind an exploration, including when labelled illustrative or temporary. Real image content such as an attachment is allowed and must be named in the audit. Compose the app UI from editable Figma instances. Make typography substitutions explicit. Keep annotations readable at the intended review zoom.

## Required sequence for a design request

1. Identify the proposed change and the surrounding app surfaces that must stay faithful.
2. Read Start here, the inventory and relevant component guides. Record exact source component IDs and their current screen uses before drawing.
3. Inspect the running app and relevant source. Record the observed build/date, data and controls; distinguish the checkout commit from the installed version. List stale or missing components.
4. Assemble an editable baseline from existing instances. Repair relevant reference gaps as reusable, documented revisions; preserve previous consumers and frozen references. Do not fix a gap with a screenshot, a simplified placeholder or an unregistered duplicate.
5. Explore only the requested scope in independent experimental components. Surroundings use the registered references. Components can change substantially inside the experiment; reuse does not constrain the new idea.
6. Check structure and visual fidelity. Use the audit and realistic width/content checks described below. Present full-app frames first, with labelled component details as supporting material.
7. After actual selection, promote the component and registered current contexts, then prepare the frozen handoff and numbered real-app QA. Selection, implementation and verified app parity remain separate facts.
8. After implementation, reconcile the actual build against the frozen contract, update verified current references and leave history unchanged.

When a reference gap is too large to repair within the task, show the concrete missing elements and report partial progress. Do not silently lower the fidelity requirement. A repaired current-app reference does not approve an unrelated visual redesign.

## Verification of the workflow

Use [the evaluation guide](design-library/evaluation.md). Run `audit-figma-frame.js` through Figma use_figma with an explicit page ID and root frame ID; keep its JSON evidence with the review. It finds image paints, resolves instance masters and reports unresolved references. This is structural evidence only: a linked component can still have stale or wrong content.

For each reviewed full-app frame, account for the header, Activity, project list, Loom when shown, transcript, composer, queued input when shown, and status bar. Compare actual controls, order, typography, spacing, overflow and density against the observed app. Check at a realistic review zoom through Computer Use when available. Do not infer Marcin's visual approval from an automated check.

Test reuse and isolation in a disposable evaluation area: changing an experimental component must not change maintained consumers; changing a disposable maintained reference must update its registered instances; a frozen sample must remain unchanged. Restore temporary values and remove test-only artifacts after collecting evidence. Never run mutation probes against real dispatched handoffs or canonical masters.

On a new agent/host, verify routing by asking it to name the skill path it read and the exact source masters it selected. The shared `.agents/skills` content is canonical; tool-specific skill directories may link to it. A skill listed in Figma or installed in another checkout is not proof that the executing agent read it.

## Promote a selected direction

Promotion requires Marcin's actual selection, not an agent's recommendation or a general positive reaction. Record the decision in the relevant Linear brief. First identify affected masters, current screen instances, overrides and frozen dependencies.

If an old master or token feeds a frozen handoff, preserve that dependency before any mutation. Prefer a new maintained revision and migrate only identified current references. Do not alter the historical frame to make room for promotion. Record old-to-new links; never mass-delete by a name prefix.

Update the maintained family, then verify every registered current screen instance and its content overrides. Search for additional uses to identify gaps. Check both isolated states and real screen density, widths, supported themes, overflow, separate actions and keyboard focus. Do not claim all screens are updated when only the registered pilot screen was checked. Approved design remains labelled awaiting implementation until app verification supplies evidence.

## Handoff

Use design-handoff.md. The brief links exact final frames, component states, prototype entry, code references, exact copy and dimensions, resizing/overflow rules, motion timing/easing/interruption/reduced-motion behavior and a numbered real-app walkthrough with expected outcomes. State what is illustrative, what is observed, and what is not specified.

Freeze an independent reference at dispatch. Audit nested component, variable and style dependencies; copy and remap dependencies or detach/unbind in the frozen copy. Preserve an export where useful. Verify access from the implementing seat through the user/Fable; a link alone does not prove the horse opened it. The walkthrough becomes the implementing issue's QA base. Fable owns dispatch and implementation decisions.

## Reconcile after implementation

Compare the actual named build against the frozen agreement. Record matches, mismatches and deliberate deviations with evidence. Keep human approval separate from agent checks. Update the maintained current reference and its date only for verified behavior; preserve frozen history. A PR, merged code, installed build and visually verified design are separate facts.

## Keeping the file understandable

Use one page per component family, with sections for anatomy, properties, states, responsive/content examples and linked contexts. Start here is the directory. Foundations document shared tokens and interaction meanings. Current screens use maintained instances. Explorations remain separate. Frozen handoffs are immutable historical contracts. Archive superseded explorations without breaking links. Expand coverage family by family and publish gaps instead of implying complete-app parity.

## Present component capabilities

Use the Activity card comparison board `618:36941` as the approved presentation example. Lead with one clear component reference and labelled instances demonstrating what it can do, changing one meaningful choice per comparison: interaction, optional actions or content, provider or style, width, and theme as relevant. Show optional elements both enabled and disabled. State what differs; do not show two identical grids while hiding their only distinguishing feature in a property. Keep exhaustive master matrices secondary and link the component to its real screen context.

Give every frame, screen, example and exploration a visible plain-language title, its state or variation, and a short explanation where needed. Layer names alone are insufficient. Keep annotations outside reusable product UI and readable at the intended review zoom. Distinguish current implementation, proposals and frozen references.

Avoid duplicate component sets and repeated controls on nested components. Keep internal components when they have a clear reuse purpose; do not require users to understand internal assembly to configure the complete component. Before consolidation, inventory consumers and preserve their content overrides. Verify actual nested bindings and visible states, not only variant names: a correctly labelled variant can still contain the wrong provider or state.

Inspect the result as the reviewer sees it, using Computer Use when available, as well as checking structure. Apply this standard to new work and references as they are maintained; preserve frozen handoffs rather than rewriting history.
