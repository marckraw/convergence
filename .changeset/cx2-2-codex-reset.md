---
'convergence': patch
---

`/clear` now works in a Codex conversation. Sending it starts a fresh thread
on the resident Codex server underneath the same conversation: the transcript
stays on screen with the "Context cleared" boundary, the model can no longer
see what is above it, and the conversation keeps its name, project, crew
memberships, connections, model, effort and account. The command itself is
never sent to the model and never appears as a message.

Because a fresh thread also loads your current MCP servers, connecting a new
tool in Codex no longer needs a Convergence restart — clear the conversation
instead.

A `/clear` sent while a turn is running is refused with a note until the turn
finishes.

In Mission Control, a connection whose recipient is a Codex conversation now
offers "Clear the conversation first", the same as a Claude Code recipient,
so a correction round delivered by the loop starts in a fresh context on
either provider.
