# Convergence Figma directory

File: [Convergence — App UI](https://www.figma.com/design/nizmdlM7yENFDQ4XQuFwoN).
Start here: node `14:785`. [Figma library directory](https://www.figma.com/design/nizmdlM7yENFDQ4XQuFwoN?node-id=698-48930).
Full discovery snapshot: [inventory.json](inventory.json).
The 24 September scan covers all 42 then-existing pages and 368 definitions,
including variant children. These are discovery counts, not 368 approved
component families. New references from this maintenance pass are registered below.

## Find before building

1. Search inventory names and parent families; prefer the explicit references below.
2. Resolve the node in Figma and read its properties, children and existing uses.
3. Inspect the app. “Reference-unverified” means compare before reuse.
4. Record a new reference's exact ID, purpose, original source, screen uses,
   observed build/date and gaps. Keep legacy IDs rather than silently remapping history.
5. After a change, refresh the affected page inventory and inspect registered consumers.
   Figma owns visual definitions; this directory is their navigational index.

| Purpose                          | Reference                                     | Status / limitation                                            |
| -------------------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| Activity card                    | `597:38613` set; capability board `618:36941` | Maintained conversation pilot; recheck current metadata        |
| Project card                     | `594:4095`                                    | Maintained conversation pilot                                  |
| Composer lifecycle               | `25:1153`; running `25:894`                   | Legacy source; lacks current account and quiet controls        |
| Queued follow-up                 | `24:852`                                      | Legacy source; current copy/height need reconciliation         |
| User / agent messages            | `3:930` / `7:789`                             | Editable source, old sample content                            |
| Collapsed / expanded tool output | `24:843` / `24:847`                           | Editable source, current row geometry must be checked          |
| Window / navigation / status     | `56:1082` / `56:1100` / `56:1121`             | Editable source, old controls/status data                      |
| Activity filters                 | `319:2978`                                    | Existing source on legacy page; inspect nested updated summary |
| Compact controls                 | `3:108`                                       | Shared source; keep existing consumers unchanged               |
| Loom                             | page `543:639`                                | Current-reference label does not establish component coverage  |

## Organization and ownership

Start here links Foundations, component families, current screens, explorations,
frozen handoffs and archives. Keep old links intact. Avoid renumbering or moving
the whole file just to make page names uniform.

Each family leads with one component reference and labelled examples showing
meaningful differences, including optional elements on/off. Exhaustive matrices
are secondary. Each current screen names its component dependencies. Experiments
use independent copies for the changed part and instances for unchanged context.

Existing screenshot-backed pilot/screens are historical placement references.
They must not be used as a baseline for new designs. Screenshots are allowed
beside a frame as comparison evidence; actual image attachments inside product
UI are separately identified in the audit.

## Preferred conversation workspace reference

Page `692:2`: **21 · Components / Conversation workspace · desktop pilot**.
Full editable screen master `693:711` is the preferred baseline for this task,
superseding the screenshot-backed pilot for new conversation explorations.
It contains no image paints. Use an instance; do not paste its exported image.

Observed reference: installed Convergence **0.86.0**, 24 September 2026, the
running Claude conversation shown by Marcin. This is a captured-content fixture,
not a claim of all-provider, all-width or pixel-perfect app parity. Inter
substitutes SF Pro. Live counts and timestamps are fixed example observations.
Some controls still use text glyphs, and transcript gutter geometry differs.
Session details was visible in a later finished conversation but absent in the
original running capture; reproduce that state before choosing its control set.
Narrow widths and other providers remain unverified. Do not freeze this fixture
as a visually reconciled handoff until those relevant gaps are resolved.

| Purpose                     | Preferred master      | Origin / source                                           |
| --------------------------- | --------------------- | --------------------------------------------------------- |
| Full conversation window    | `693:711`             | Composition of references below                           |
| Composer, running Claude    | `692:5`               | Revision of `25:894`; composer.presentational.tsx         |
| Queued follow-up            | `692:89`              | Revision of `24:852`                                      |
| Collapsed tool              | `692:85`              | Revision of `24:843`; transcript-entry.presentational.tsx |
| Background task event       | `693:661`             | Newly registered gap from observed transcript             |
| Transcript fixture          | `693:665`             | Instances of tool and event masters                       |
| Conversation header         | `693:607`             | Existing Compact control instances; current controls      |
| Activity/project sidebar    | `693:22`              | Maintained Activity/Project card instances                |
| Activity filter summary     | `694:989`             | Revision of `319:2978`                                    |
| Loom rail / horse           | `693:559` / `693:552` | Registered assembly gap; desktop Now fixture              |
| Window / surface navigation | `692:94` / `692:112`  | Revisions of `56:1082` / `56:1100`                        |
| Global status               | `692:137`             | Revision of `56:1121`, includes agent meter               |

Legacy masters remain for existing consumers. These revisions are app-reference
maintenance, not approval of the experimental actions wheel. Frozen handoffs
have not been remapped. The full historical inventory remains a dated snapshot;
these additions are registered here to avoid silently changing snapshot counts.

## Running the checks

[Evaluation procedure](evaluation.md). [Frame audit](audit-figma-frame.js).
The audit is executed through Figma, not as a local browser or app script.
No Code Connect or automatic design/code synchronization is involved.

[Recorded pilot evaluation](evaluation-results.md) separates successful reuse
checks from the visual work still needed. Conversation actions R4 begins at
`696:5906`; the independent workflow trial is on page `698:2`.
