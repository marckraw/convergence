---
'convergence': patch
---

Crew import offers the member already holding a role's baton instead of leaving
a `create` row with nothing to choose (MAR-2918).

A crew whose member carried the baton `fable` while its conversation had been
renamed locally sent the import into a room with no door. The file's role
looked for its conversation by name, found nothing, and planned to create one;
the final-baton check then blocked the crew row, correctly, because the new
conversation and the existing member would both have been called `fable` — but
the row it pointed at offered no options. The refusal was honest and there was
no way to act on it short of editing the file or renaming the conversation back
by hand.

The planner now names the member. When exactly one member this import keeps
carries the role's baton, the `create` row says so and offers "bind the member
that holds this baton"; choosing it binds that conversation, with no new
conversation created and no baton renamed, and the collision goes away. The
option is offered and never taken on the user's behalf — the planner still binds
nothing that was not chosen. A member some other role in the same file already
binds is not offered, since binding it would only trade one collision for
another.

A crew that somehow carries one baton on two members cannot be repaired by
choosing, because whichever one was bound the other would still collide. That
case now names both members and asks for a rename in the crew first.

The dialog's Decision cell also stopped keying off the row's state: any row
carrying options renders its chooser, which is what lets a `create` row present
one.
