# Crew configuration v1

Mission Control’s crew menu exports `.convergence/crews/<crew-name>.yaml`
inside the project with the most members. A tie opens a project chooser.
Existing files require an explicit replacement choice. “Include positions”
is off by default; positions describe only cards the user has moved.

The file starts with a YAML language-server reference to
[`crew-config.schema.json`](crew-config.schema.json). Roles are keyed by baton
name, or by a conversation-name slug when no baton exists. Wire targets need
a baton name. Duplicate role keys and missing wire endpoints refuse export.
Roles sort by key; wires sort by source, target and condition, with their
remaining content breaking ties. Project references use normalized Git origin
keys, falling back to project names when there is no origin. Lane roles and
spawn targets reference their root project’s origin key or name and carry an
optional `lane` string for the lane name. Global roles use `project: null`.

Session, crew, relay and account identities and timestamps are omitted.
The `host` field retains the execution host identifier as required by the
remote-parity contract. Custom permission blocks and standing relay text are
carried in the recipe; spawn accounts become `default`. Export reads local
records and local Git metadata and makes no execution-host request.

`crewToConfig` and `renderCrewYaml` are pure. The test-local `parseCrewYaml` is
only the inverse for the C1 round-trip canary; it is not a validation or import
API. The schema pins the data shape, while the exporter checks references
between roles and wires. The database remains the live instance.

Export resolves default limits into numbers; importing them makes those limits
explicit choices rather than inherited defaults.
