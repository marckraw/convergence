---
'convergence': patch
---

A relay can now send a first message of its own — `/clear`, say — before the
one it carries, which turns a long-lived session into a worker you recycle
every lap (MAR-2529).

**The recycled worker.** Draw a wire and the hail form offers a **First send**
box: "e.g. /clear to reset the target before delivering". The wire then sends
that message on its own, and the payload it was drawing — your instructions
plus the finished session's last message — waits behind it and lands in
whatever context the first message left. So a session that would otherwise
fill up over a long run gets wiped and re-briefed by the same wire, over and
over, instead of dragging every previous lap along with it.

The wire says so out loud. Its sentence reads "When Implementor finishes, send
its last message to Reviewer · sends /clear first", with the literal text
rather than a vague "sends something first" — which command it is decides
whether the target keeps its memory. The trail says it too: one hop row, whose
preview reads "First send: /clear · then: …". A hop that wiped its target
before delivering must never look like an ordinary delivery.

One firing is still one hop, one charge against the loop budget, and one turn
of the loop law — a wire that opens with a first send does not get to fire
twice.

**The transcript stops lying after a clear.** Convergence never erases what you
have read, so until now a cleared conversation carried on looking continuous:
the messages above were still on screen, and nothing said the model could no
longer see any of them. A restarted conversation now draws a visible boundary
across the transcript — "Context cleared — the conversation restarted fresh" —
wherever it happens, whether a relay did it or you typed `/clear` yourself.

The first send is plain text and its meaning belongs to whoever receives it:
`/clear` is Claude's word, and on another provider the same box is simply a
message that goes first. It is offered on wires that hail an existing session,
since a wire that starts a brand new one has nothing to clear.
