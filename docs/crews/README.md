# Crew configuration v1

Mission Control’s crew menu exports `.convergence/crews/<crew-name>.yaml`
inside the project with the most members. A tie opens a project chooser.
Existing files require an explicit replacement choice. “Include positions”
is off by default; positions describe only cards the user has moved.

The file starts with a YAML language-server reference to
[`crew-config.schema.json`](crew-config.schema.json). Roles are keyed by baton
name, or by a normalized conversation name when no baton exists. Wire targets need
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
only the inverse for the C1 round-trip canary. Runtime `readCrewConfig` parses
YAML and returns the first path-qualified shape or record-law error. Dev-only AJV tests
check it against the published schema. The database remains the live instance.

A wire's `when` is either the exact reserved word `settled` (unconditional)
or a nonblank condition accepted by the record's condition normalizer.
Case variants are ordinary conditions, not the reserved word. Any condition
the record would rewrite is refused with the written and stored values;
write it exactly as the record would keep it.
Export refuses a stored condition literally `settled`; rename that condition
before export. Layout references with invalid baton names are ignored; two
layout keys normalizing to the same name refuse import.

Export resolves default limits into numbers; importing them makes those limits
explicit choices rather than inherited defaults.

## Import and reconciliation

**Import crew…** sits beside **New crew** in Mission Control's session crew
picker. It reads a YAML file from any path. The pure `planCrewImport(config,
world)` compares it with an explicit local snapshot: conversation name, root
origin (or root name), optional lane, and execution host determine candidates.
Ambiguity always asks; missing projects can use **Choose folder…**, while
missing lanes and execution hosts must be created through their existing UI.
Remote conversations can be bound, but import cannot create them in this
version. Spawn wires require `opener: keep`, because RelayService cannot store
an opener on a fresh conversation; an incompatible recipe stays blocked. Plan and Apply make no execution-host requests.

Role keys use the record's baton-name normalization (trimmed, whitespace
collapsed, lowercase). Invalid names and duplicate normalized keys are refused
with a role-qualified reason before planning; the schema checks structure and
the record normalizer owns these semantic rules. Archived conversations are
excluded: an archived-only match creates a new conversation without unarchiving.

Model and effort differences offer **Update to file**, checked by default,
when the provider matches. Baton-name differences use the same checkbox and
apply in Phase A only when selected. Kept wires waiting on a renamed baton
show a warning while the rename is selected, unless another selected rename
takes over that baton. The plan blocks decisions that would leave two members
with the same baton, including kept members; unresolved role choices do not
count as new members. Wire conditions use the engine’s canonical comparison,
including case, whitespace and baton formatting. Wire and layout references
resolve through normalized role keys. Unnamed export fallbacks use the same
32-character baton-name law; an invalid fallback asks for a baton name before export.
Provider and permissions are fixed at creation: choose **Bind as is** to keep
those local values, or **Create new** to use the recipe's values in a fresh
conversation. A bind-as-is choice can request a model/effort update only when
the provider matches; the session service can still refuse a running conversation.
Local members and wires absent from the recipe are kept. Layout applies only
to listed roles when **Include layout** is checked.

Apply rereads the file and refuses stale decisions. Phase A is one synchronous
transaction through the session, crew and relay services: create conversations,
reconcile membership/baton names, positions, wires and limits, then stamp the
crew with `config_path`, `config_sha256` and `config_applied_at`. The migration
adds nullable columns once under an `app_state` marker. No records are deleted.
A transaction interruption rolls back these database writes; creating the
shared global working directory can leave an empty directory behind.

Phase B runs after commit, sequentially calling `SessionService.setModelSelection`
for each requested model/effort update. Its guards decide whether the update
lands, and its own transaction records the model-change transcript note.
A refusal is reported as **not updated: <reason>** without rolling back Phase A.
If that row’s baton rename already landed, the report says
**baton updated; model not updated: <reason>**.
The stamp means **applied at this hash**; it does not promise every requested
model change succeeded. A refused update stays visible in the report and in
the next plan. Reapplying an unchanged, fully reconciled file creates no
conversations or wires and reports **Nothing to change**. This means no
effective configuration change: the provenance stamp is still refreshed, and
inherited limits equal to the file become explicit stored values.
