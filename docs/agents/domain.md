# Domain Docs

Convergence uses a single-context documentation layout.

Authoritative domain and architecture docs:

- `docs/architecture/quick-reference.md` — it replaced the project spec,
  deleted on 2026-06-01 (`git show 7ef9e546^:docs/specs/project-spec.md`)
- `docs/adr/`

Feature specs and implementation plans live under:

- `docs/specs/`
- `docs/initiatives/`
- `docs/spaces/`

Agent-facing rules:

- Read the relevant spec before implementing a ticket.
- Check `docs/adr/` for decisions that constrain architecture.
- Preserve the FSD-lite renderer layering described in `AGENTS.md` / `CLAUDE.md`.
- Keep Electron backend process orchestration outside the renderer tree.
