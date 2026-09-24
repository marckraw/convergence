# Workflow pilot evaluation — 24 September 2026

This records an operating-workflow test, not acceptance of a product design.
File key: `nizmdlM7yENFDQ4XQuFwoN`.

## Discovery and reuse

A fresh agent received the repository path and a request for a small action at
the right of a full conversation screen. It did not receive component IDs.
It read AGENTS.md, discovered the exploration skill, followed the directory,
and used the registered full-screen master `693:711` as actual instances.

- Evaluation page: `698:2`.
- Closed: `698:6`, baseline instance `698:7`.
- Open: `698:1508`, baseline instance `698:1509`.
- Closed audit: 463 nodes, 125 editable texts, 29 resolved master IDs.
- Open audit: 468 nodes, 128 editable texts, 29 resolved master IDs.
- Both: zero image paints, zero unresolved instances.

These counts describe the audit moment; later master maintenance can propagate.
The action trigger was derived from Compact control `3:108` and detached for
the experiment. Changing and restoring its test label left six serialized
reference/consumer subtrees unchanged. The experiment had no shared token,
style or nested-instance dependency. No product code was changed.

The trial caught a stale Start here link to the screenshot-backed context. That
link now points to the editable desktop fixture. The library directory is
`698:48930`; it links the dated 42-page discovery snapshot and preferred masters.

## Audit and dependency probes

| Probe                                                                     | Observed result                                                                           |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| New Conversation actions open frame `696:7325` (after fixture correction) | 470 nodes, 128 editable texts, zero image paints, zero unresolved instances               |
| Known-bad old frame `680:5907`                                            | Its full-size image fill was detected; only four editable text nodes                      |
| Disposable nested master propagation                                      | Two instances changed from “Before” to “After” when their nested master changed           |
| Independent frozen copy                                                   | Retained “Before”; no remaining nested instances                                          |
| Probe cleanup                                                             | Disposable root `699:1013` and all descendants removed; real maintained masters untouched |

The image audit intentionally reports image paints rather than automatically
approving them. A legitimate image attachment and a screenshot impersonating
editable UI require different judgments. Actual main-component links—not IDs
listed in a report—establish structural reuse.

## Visual evidence and limits

The full frame and the trial frames were rendered at 1232×768 and inspected.
The original app capture was installed Convergence 0.86.0, running Claude. The
trial's live app showed a different, finished conversation. This establishes
editable full-app composition, not exact same-state parity.

Inter, some text glyphs, transcript gutter geometry and header state coverage
still need reconciliation before a final product handoff. Session details was
visible in the trial's live app and source but absent in the original capture;
the difference remains explicitly recorded. Narrow windows, long-content
stress cases, all providers and prototype keyboard behavior were not tested.

The trial attempted browser Computer Use review; that Chrome Figma session was
signed out. Figma frame renders were available and inspected. No claim of a
browser zoom/interaction test or Marcin's approval is made.

Discovery, reuse, isolation, propagation and nested freeze passed. Visual
fidelity is partial; human acceptance remains pending. Future design work must
repeat only the checks affected by its changes and close its relevant gaps.
