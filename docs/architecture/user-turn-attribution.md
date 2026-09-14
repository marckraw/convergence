# User-turn attribution

The adapter owns the account fact on `conversation.item.add` for a user
message. `providerAccountId` names the credential binding accepted for that
turn; explicit `null` means the ambient account and omission means unknown.
Both unknown and ambient persist as SQL NULL. The service never fills this
field from the composer, a pending dispatch, text matching, or event order.

Attachments and resolved skill selections likewise belong to the adapter's
user item. They describe input bound to the turn; a subsequent read or send
failure fails that turn without changing its attribution. Every user item
still opens its own `session_turns` row, including adapter continuations.
Duplicate item IDs do not open another turn.

Claude takes one immutable account snapshot per preparation and resolves its
environment before accepting the dispatch or emitting the user item. A
synchronous preparation guard defers competing input to the service queue.
Recovery retains the existing snapshot and remains pending while an earlier
preparation is still reading attachments. Account/environment failure emits a
note and failed status with no user item. Skills resolve after binding; a
skill failure retains the user's message, failed selections and bound account.
Other failures after binding likewise retain the item. Codex user events name the account bound to their app-server connection.
Other ambient adapters explicitly emit null. One-shot helpers emit no turn
rows; their account binding is verified at the process environment boundary.

A handle may defer input with `queue-follow-up`, or explicitly refuse it
with a reason. The service preserves deferred input and fails refused
delivery without attaching it to the live turn. A queued input keeps the
account originally requested, but its eventual user item records the
adapter's actual binding.

The current remote protocol echoes user text without account, attachment,
or skill provenance. Those remote fields remain unknown rather than being
reconstructed from local pending input. MAR-3018 tracks protocol provenance;
local account selections are refused before a remote follow-up is enqueued.
