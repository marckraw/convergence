# Agent-Native Initiatives

This folder captures the product direction for Initiative-based work tracking
inside Convergence.

The feature exists because Convergence is not only a chat surface for coding
agents. It is becoming the place where an engineer drives many pieces of
agent-assisted work across projects, branches, workspaces, and pull requests.

Traditional issue trackers start with a fully written ticket and only later
move into implementation. Convergence should support the opposite flow:

```text
rough idea
  -> agent exploration
  -> attempts and forks
  -> decisions and open questions
  -> implementation and review
  -> one or more pull requests
  -> merge or release outcome
```

The top-level object for this flow is an **Initiative**.

An Initiative is a durable delivery container for agent-driven work. It tracks
the journey from rough idea through exploration, implementation, review, pull
requests, and final outcome across one or more projects.

## Documents

- [Product Spec](./product-spec.md): current product model, terminology,
  UI direction, V1 scope, and open questions.
- [V1 Implementation Plan](./v1-implementation-plan.md): phased delivery
  plan with test expectations and manual verification notes.
