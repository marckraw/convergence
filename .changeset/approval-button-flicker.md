---
'convergence': patch
---

fix: keep approval buttons visible while a tool/approval is pending

Approval buttons used to disappear when Codex streamed an assistant
delta (or other non-note item) after raising the approval, leaving the
session stuck waiting. Approval actionability is now derived from
`session.attention` plus the local resolved-id set, not from the
ordering of conversation items.
