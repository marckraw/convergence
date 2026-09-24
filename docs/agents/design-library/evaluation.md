# Verify the design workflow

Use a disposable Figma evaluation area and the current library directory.
Record exact node IDs, what was read, actual results and remaining uncertainty.
Do not turn an agent's own check into Marcin's acceptance.

## Fresh-agent trial

Give an independent agent the repository path and a realistic request, not
the intended answer: “Explore a contextual action in the current conversation
screen; preserve existing controls and show the entire app.” Authorize only
an isolated evaluation frame. It should discover the skill, inventory, masters
and registered current screen without being given their IDs in the prompt.

Review the resulting frame's actual main-component links, editable text,
visible controls and labels. A report listing the correct IDs while drawing
unrelated boxes is a failure. If a suitable component is missing, the agent
should identify and register the gap rather than improvise a false current UI.

## Structural audit

Read audit-figma-frame.js. Through use_figma, define its function (remove the
module export), then call it with the Figma object, page ID and root frame ID.
Load figma-use first. It switches page once. Record its return value.

Images require an explicit legitimate-content reason; screenshots representing
app UI fail regardless of an allowlist. Master resolution and image detection
are necessary evidence, not sufficient proof of visual fidelity or good UX.
Compare the returned masters with the directory and explain new dependencies.

## Behavior probes

1. Reuse: an unchanged composer resolves to the registered master.
2. Isolation: in a disposable experiment, change a test label. A serialized
   before/after comparison of maintained consumers remains equal.
3. Propagation: change a disposable master label. Its two test instances update.
4. Freeze: an independent frozen test copy retains its original text after
   the disposable master changes. Include nested dependencies in the probe.
5. Fidelity: compare the full frame with observed app content at the same
   window size; inspect composer controls, transcript/tool rows, sidebars,
   header, queued input and status. Check narrow width and long content too.
6. Clarity: every review example has a visible title and the distinguishing
   state or optional element is actually shown.

Use a small known-bad frame containing an image fill to prove the audit catches
it; use a dead/unregistered reference or duplicate-name example to check
discovery. Preserve evidence, restore test values and delete test-only artifacts.
Do not mutate real maintained masters or frozen delivery frames for probes.

## What a pass means

Report each result separately: discovery, structure, isolation, propagation,
freeze, visual comparison, human acceptance. Unrun checks stay “not run”.
A stale catalogue, passing JSON validation or clean screenshot detector alone
does not prove this workflow works. Re-run after relevant changes, not merely
to repeat a green result.
