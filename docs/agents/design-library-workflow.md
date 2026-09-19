# Maintaining the Convergence design workspace

Read DESIGN.md and design-workflow.md first. This workflow governs deliberate maintenance of the app/Figma relationship; it does not establish automatic synchronization or one-to-one code/component mappings.

## Find the reference

Start at Figma file `nizmdlM7yENFDQ4XQuFwoN`, page `14:785` (Start here). Its directory identifies maintained component families, screen examples, exploratory work and frozen references. Prefer exact node links over page numbers or search-result names. A page called Current is not proof of parity: inspect its verification date, source commit and limits.

For each family maintain a visible record: human name; code symbols and repository paths; component node links; screen-instance links; observed app version/commit and date; design status; coverage and limitations. Keep observed implementation and approved-but-unimplemented design separate. Put product decisions and rollout work in Linear, operating knowledge here.

The conversation pilot starts at page `594:2821`. Activity card set `597:38613` (default `595:1294`), project card set `594:4095`, and capability comparison board `618:36941`. The Activity card owns its content and action controls directly; the former separate body set and review-actions master were removed during consolidation.
The directory frame is `600:2`; family guide `599:2668`; registered full-screen
context `597:38615` on page `597:38614`. That context uses nine maintained
conversation instances over screenshot-backed surroundings; it is not a fully
editable whole-app reconstruction. Other screens are not migrated by this pilot. Earlier page `299:2` remains a historical dependency source; do not assume all its contents are current.

## Explore

Inspect the relevant running app surface, renderer code, maintained component, and screen context before changing a design. Record missing facts rather than inventing a tidy state. Preserve real metadata, distinct controls, loading/failure/empty behavior and long-content density unless their change is explicitly part of the proposal.

Use maintained instances for unchanged surroundings. For the part being redesigned, create independent experimental components or detached copies on a named Exploration page. A cloned frame containing instances is NOT isolated from those masters. Audit nested instances, styles and variables: copy the dependencies being changed, or detach/unbind those dependencies in the experiment. Do not edit canonical tokens to try an idea. Exploration may depart substantially from existing components; reuse is context, not a restriction on creativity.

Label each experiment with its question, provenance, changed scope and known limits. Screenshots may be evidence or a clearly labelled backdrop, never a substitute for an editable component claimed as reusable. Make typography substitutions explicit. Keep annotations readable at the intended review zoom.

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
