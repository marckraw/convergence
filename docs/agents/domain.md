# Domain Docs

Convergence uses a single-context documentation layout.

Authoritative domain and architecture docs:

- `docs/specs/project-spec.md`
- `docs/architecture/quick-reference.md`
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
