---
'convergence': patch
---

Change the model mid-conversation, and a transcript that says which one wrote
what (MAR-2550, MAR-2551).

**Fable runs out; the conversation does not.** Until now a session's model was
fixed the moment it was created — the only way to carry on under a different
one was to start again and lose the thread. Now, while a session is finished
and waiting for you, the model and effort selectors are live: pick Opus, send,
and the next turn resumes the same conversation on the new model. Nothing is
lost — the agent keeps everything it already knew — and the transcript marks
the point where the model changed.

It turns out nothing ever made this impossible. Every provider already takes the
model per turn, and Convergence already re-read the session row for every
resumed turn — there was simply no way for the row to change.

**The provider still cannot change**, and that constraint is real rather than
inherited: a continuation token belongs to the provider that issued it. So the
provider selector stays locked for the life of a session, and the model dialog
now offers only that session's own provider. Starting a new session is
unchanged — a draft still chooses freely across all of them.

**The controls are honest about when they work.** Model and effort grey out the
moment a turn starts and come back when it finishes. Try to change one anyway —
through a queued request, in the instant between pressing send and the turn
actually starting, or while the agent is waiting on an approval — and it is
refused out loud with the reason, never quietly dropped. And if a session's
provider is missing from the app entirely, the composer says so plainly instead
of showing you some other provider's model while writing to that session's row.

**The transcript records the switch.** Each turn now stores the model and effort
it actually ran on, and a quiet blue boundary appears in the transcript where
the model changed — "Model changed — fable → opus. Replies above this point came
from fable; replies below come from opus." — so scrolling back a week still
answers which model wrote which answer. A session that never changes model
shows nothing at all. Changing only the effort is recorded on the turn but draws
no boundary: it changes how hard the same author thinks, not who the author is.

**The context meter stops under-reporting Opus.** The unversioned `opus` alias
was falling through to the 200k tier while `fable` was correctly treated as 1M,
so switching between them made the meter drop five-fold in the wrong direction.
Because `opus` is also Claude's default model, every session on the default has
been showing a fraction of the window it actually has. Both now read 1M;
genuinely older pinned models such as `claude-opus-4-5` keep their real 200k.
