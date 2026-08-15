---
'convergence': patch
---

Crews can now carry Flows: named wires that hand work from one session to the
next, with Convergence doing the carrying (MAR-2437, MAR-2438).

A relay is one wire. When the session it listens to finishes, its last assistant
message is carried somewhere — either into another session in the same crew, or
into a brand new session the relay opens and starts on that message. That is the
whole vocabulary. Agents never call agents; Convergence is the switchboard, and
it only ever moves a message because you drew a wire telling it to.

Relays live inside a crew and are read as sentences, not configuration. "When
Implementor finishes, send its last message to Reviewer" is the whole row, with
its arm switch sitting right at the front of it. Arming and disarming is one
click and never buried in a menu, because a wire that sends real prompts to real
providers should be as easy to switch off as a light. Nothing is armed that you
did not arm.

The authoring form is laid out as the sentence it will become. Both ends are
picked from the crew's own members, so you cannot draw a wire the engine would
refuse — and when something is still missing, the form says which in plain
words rather than leaving a dead button. A relay that starts a new session says
exactly what it will open: which provider, which model and effort, which project
or none at all, and what it will be called. The session it opens joins the crew,
so it never appears from nowhere.

Loops are allowed on purpose. A wire from A to B and back from B to A is a
review loop, which is the point. The guard is a budget rather than a ban: twenty
automatic hops in one run, after which the relay disarms itself loudly and says
so. One click re-arms it.

Every firing is written down — deliveries, new sessions, skips and failures
alike. Each crew keeps a hop trail, newest first, with the reason attached to
every skip and the error text of every failure shown outright rather than hidden
behind a click; only the carried message folds away. A crew whose wires errored
or hit the budget is outlined in red and badged with a count, visible from
across the room without opening anything, and the trail grows live as wires
fire. Session cards wear a small wire glyph so you can see at a glance what is
connected to what.
