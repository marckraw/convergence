---
'convergence': minor
---

Convergence is the conversation and Mission Control (MAR-2609).

**Code review has left the app.** Codewalk does that job better, so the copy
that lived here is gone — the review surface and its dashboard, review notes,
guided review generation and its remote daemon, the pull-request review starter,
the `/code/review` route, the Command Center entry, the Tools-menu item, and the
Guided review section of Settings. Nothing in the UI offers a review any more.
This is a narrowing, not a bin: the feature moved to the app that does it well,
and the attention it was costing goes back to the conversation.

**The working-tree Changed Files drawer in a session goes with it.** That panel
was the review store's, not the turn record's — it compared your working tree
against a base branch. It is why code review reached into the session view at
all, and removing it is what let the excision come out clean.

**Turns are untouched, and that is the load-bearing claim.** The Turns panel,
its per-turn file tree, and its diff viewer all keep working exactly as before;
they merely shared a file tree with the panel that died, so the tree stayed.
`turn-list.container.test.tsx` is the canary — starve that tree of paths or feed
the diff header a wrong path and it goes red, which is how we know the excision
did not nick anything on the way past.

**Your review notes and generated guides are still in the database.** Code is
cheap to reverse and your data is not, so `review_notes` and `code_review_guides`
keep their rows and their schema, now carrying a comment that says why. Nothing
reads or writes them. MAR-2615 drops them once you confirm you do not want what
is stored there.

**Settings loses one section and keeps its guard.** With Guided review gone, the
Save button's blocked state now tracks the remaining URL field it always shared
that job with — the remote execution host — instead of silently letting you
click a Save that would refuse.
