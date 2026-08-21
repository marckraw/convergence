---
'convergence': patch
---

A message you can send without waking the wires, and the wires themselves
visible from inside the session (MAR-2537, MAR-2538).

**The quiet send.** A session bound to a flow is meant to fire — but not every
message is flow work. Typing `/compact`, typing `/clear`, or asking an ad-hoc
question would carry that turn's last message down every wire leaving the
session, spending provider quota and waking another agent mid-work. A **Quiet**
toggle now sits in the composer's control row, and it appears only for a
session something actually leaves. Switch it on, send, and the wires hold.

It is per send and never sticky: the toggle switches itself back off the moment
the message goes. Once the quiet work settles, the next ordinary send carries as
usual, with nothing to remember.
The Hail carries the same toggle, because the Hail _is_ the composer.

Nothing is inferred. Convergence does not read your message looking for slash
commands and silence itself — a wire that stops firing for reasons you did not
ask for is worse than one that fires when you forgot.

**A held wire still writes a row.** No silent hops, and no silent non-hops:
each armed wire leaving the settling session records a quiet grey **held — sent
quiet** row in the crew's trail, saying "This message was sent quiet, so the
wire did not fire. It is still armed for the next one." No budget is charged, no
chain is advanced, and nothing is disarmed.

Quiet is scoped to the settle rather than to one message: if any message
contributing to the finished work asked for quiet, the settle is quiet. That
tie-break is deliberate — erring quiet costs one manual hail, erring loud spends
quota and interrupts an agent, and those are not the same size of mistake. The
request survives a restart, so a remote run that outlives the app and reattaches
still honours the quiet you asked for before it.

**The wires, from inside the session.** The session header now carries a small
wire count whenever anything leaves that session; open it and each wire reads
out in the same sentence the crew screen uses — "When Implementor finishes, send
its last message to Reviewer". Disarmed wires are listed and read grey, so a
switched-off wire is visible rather than merely absent. It is read-only: wires
are still drawn, armed and deleted in Mission Control. A session nothing leaves
shows nothing at all.
