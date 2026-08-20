---
'convergence': patch
---

A relay chain now ends when it has been all the way round, and a wire can carry
your own instructions above the message it delivers (MAR-2524, MAR-2525,
MAR-2526).

**A wire fires once per flow run.** Loops between sessions were always the
point — A hands to B, B hands back to A is our own review loop — but nothing
noticed when a chain had finished. A ping-pong kept going until the 20-hop
budget killed it, twenty real provider turns later, and switched the wire off
to do it. Now the second time a run reaches a wire it has already used, the
wire declines: the trail shows one quiet grey row, "This wire already fired in
this run; a wire fires once per run", and nothing is disarmed. A → B → A ends
at two hops, with both wires still armed for next time. The hop budget stays
underneath as a backstop for a long chain of different wires.

Hailing a session yourself always starts a fresh run, so a conversation you
pick up by hand tomorrow fires its wires again exactly as you would expect.
Convergence now tracks which run a session's work belongs to as work is handed
over, rather than guessing from the ledger — the old guess had no sense of time
and would have treated a hail you typed a week later as part of a chain that
finished long ago.

**Instructions on the wire.** A relay used to carry only the raw last message,
leaving the far end to work out what it was for. The add-relay form now has an
optional Instructions box, for both kinds of wire: write "Take a look at this
and tell me what you would change", and every hop arrives with that above the
finished message, separated by a blank line. The wire's sentence gains a quiet
"· with instructions" so a briefed wire says so at a glance, and the hop trail
records what was actually sent rather than what the source session happened to
say. Leave the box empty and the wire carries exactly what it always carried.

Also: an explanation under a trail row now takes that row's own colour, so a
wire behaving correctly no longer reads in alarm red. For anyone extending the
flow layer, `docs/architecture/relay-engine.md` writes down the laws and the
seams a new trigger, action or payload transform actually lands on.
