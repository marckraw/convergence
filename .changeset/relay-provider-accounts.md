---
'convergence': patch
---

Relays and review sessions now run on the account you enrolled, instead of
whichever credential happens to be signed in on the machine (MAR-2509).

Enrolling accounts was meant to end work being billed to the wrong
subscription, but only the composer ever honoured the enrolled default. Every
turn Convergence started by itself — a relay carrying a message onward, a
session a wire opened, a pull request review — quietly ran on the ambient
`~/.claude` credential. Those hops failed for anyone whose real work lives on a
different account.

A hop now rides the account its target session has been using: a relay is
another turn in a conversation already under way, not a new relationship, so it
does not change who is paying for it. A session with no turns yet, and a session
a wire opens from nothing, take the enrolled default for their provider — the
same one the composer would have preselected. With nothing enrolled, everything
behaves exactly as it did before.

A wire that starts new sessions can now name the account those sessions are born
on, chosen with the same picker the composer uses, and offered per provider like
the model and effort already are. It has to be chosen up front rather than
corrected later, because a session's credential is fixed the moment its first
turn begins. When a wire names an account explicitly, its sentence says so —
"start a new session called Reviewer — codex in Convergence · as you@example.com"
— so a wire that spends a particular subscription says which one out loud. A
wire that names none stays quiet about it, because "the enrolled default" is
resolved when the wire fires and naming today's default would be a promise the
wire has not made.

Sessions on remote execution hosts continue to run on the ambient credential,
which is the only thing a remote host can use.
