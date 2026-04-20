---
'convergence': minor
---

Add session fork with full-transcript and structured-summary strategies.

- A new **Fork session…** action is available from a session's header kebab
  menu and from the Command Center (Cmd+K) when a session is focused. Each
  entry opens a fork dialog pre-populated from the parent session's name,
  provider, model, and effort.
- **Full transcript** strategy seeds the child session by pasting the
  parent's conversation verbatim. **Structured summary** asks the parent's
  provider to extract decisions, key facts (with verbatim evidence),
  artifacts, open questions, and suggested next steps into a typed artifact
  rendered as an editable markdown seed. The summary strategy is disabled
  for parent sessions with very short transcripts.
- The dialog also lets you pick a different provider/model/effort for the
  child and choose whether to reuse the parent's workspace or create a new
  worktree on its own branch.
- Forked sessions display a **Forked from: &lt;parent&gt;** chip in their
  header that navigates back to the parent with a click. Session fork
  tracking is persisted in the sessions store alongside existing session
  metadata.
