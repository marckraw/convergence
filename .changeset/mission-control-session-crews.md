---
'convergence': patch
---

Sessions can now be gathered into crews, and Mission Control can be laid out by
them (MAR-2434, MAR-2435).

A crew is a named, decorated collection of sessions that crosses projects — a
mastermind in one repository can ride with workers in three others. Membership
is many-to-many: a session belongs to as many crews as you like, and joining one
is never leaving another. Crews promise membership and nothing else. There is no
automation here, no dispatch, no relay; a crew is a way to see your work
arranged the way you actually think about it.

Every session card gains an "Add to crew" gesture. It toggles like checkboxes
and stays open, so a session can join several crews in one pass, and you can
make a new crew right there — name, emoji, accent colour — with the session you
started from already in it. The colour is not decoration for its own sake: it
becomes the crew's container border, its filter chip and the badges on every
card that belongs to it, so a crew is recognisable across the room before you
read a word.

Mission Control gains a Flat | Crews toggle. Flat is exactly the room you
already know. Crews lays the same cards out inside bordered containers, one per
crew, with a "No crew" section at the end so nothing ever disappears by
switching layouts — and a session in two crews honestly appears in both. Each
container header renames, redecorates or deletes its crew; deleting says plainly
that the sessions stay exactly where they are, because a crew is a label and
never an owner.

Crew also joins the filter row as a fifth dimension, alongside states, projects
and providers, wearing each crew's accent. Like the others, each chip carries a
live count of what turning it on would reveal, and all five narrow together.
Which crews you have picked, and which layout you left the room in, are
remembered across restarts.

Crews live in the database rather than in browser storage, so they survive, and
every window updates the moment one changes.
