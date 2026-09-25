# Domain Docs

Convergence uses a single-context documentation layout.

Authoritative domain and architecture docs:

- `docs/architecture/quick-reference.md` — it replaced the project spec,
  deleted on 2026-06-01 (`git show 7ef9e546^:docs/specs/project-spec.md`)
- `docs/adr/`

Feature specs, roadmaps and implementation plans do not live in this repo.
They live in Linear, in the `convergence` project (team `marckraw`), as the
ticket itself and the Linear documents attached to it — see "Planning and
documentation ownership" in `AGENTS.md`.

Agent-facing rules:

- Read the ticket and its linked Linear documents before implementing it.
- Check `docs/adr/` for decisions that constrain architecture.
- Preserve the FSD-lite renderer layering described in `AGENTS.md` / `CLAUDE.md`.
- Keep Electron backend process orchestration outside the renderer tree.
