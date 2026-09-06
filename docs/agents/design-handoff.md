# Design brief for Fable

This is a reusable writing convention, not a feature brief or queue. Create
actual briefs as documents in the Linear **convergence** project. Use the
sections that help the decision; a small change should have a small brief.

## Template

### Problem and desired outcome

Who is trying to do what? Where does the current experience fail them?
What would a successful experience let them understand or accomplish?
Include the observation or assumption behind the problem.

### Direction and decision record

Describe the recommended approach and why it wins over the alternatives
considered. State what Marcin has explicitly ratified, with date and his
words where useful. Label recommendations and unresolved questions separately.
Name the authoring role and brief revision.

### Selected design references

Link the exact Figma frames and selected revision. Identify whether they
show existing behavior, reconstruction, or a proposed change. Include a
prototype only if it answers a relevant interaction question, and say what
it simulates. Confirm that the selected references and their component
dependencies are preserved before a run dispatches.

### Experience promises

List the few things implementation must preserve: what the user sees,
understands, can do, and can recover from. Include relevant empty, loading,
error, and permission states. State essential copy, layout, or interaction
constraints explicitly; identify visual details that remain flexible.

### Scope and questions for Fable

What is deliberately outside this direction? What assumptions need technical
validation? Which existing domain concepts or ratified rulings may be affected?
Offer known code references as evidence, not prescribed architecture. Do not
invent ticket IDs, estimates, implementation phases, or a dispatch commitment.

### Review in the real app

Provide a short walkthrough with observable outcomes and concrete fail-signals.
State what the design alone cannot prove. Marcin judges feel; any design
assessment is input to Fable's review, not an additional automatic gate.
Fable carries this walkthrough into the implementation kickoff as the base of
the run's QA list, so the executor's checklist and the brief cannot diverge.

### Delivery references

Initially say that Fable's grooming is pending. Link the implementation
tickets, run, and later release evidence when they exist. Refer to their
statuses rather than copying a second delivery state machine into the brief.

## Handoff message

Give Marcin a short prompt to carry to Fable: the brief URL, selected revision,
what he ratified, and the questions Fable should resolve. The message does not
arm work. Fable reads the brief, applies the project's doctrine, and follows
the existing run process. Tell Marcin in plain language what was recorded.
