---
'convergence': patch
---

The daemon snapshot's pull request decoder is gone, the drawer's legacy labels
are named, and gh's unusable replies say what is actually missing (MAR-2991).

Three leftovers from the era before the session PR became one fact with one
writer (MAR-2978).

The wire door decoded a session snapshot's `prUrl` into a three-way reading —
the daemon's own negative, a URL, or an unreadable shape — and carried it across
IPC into a renderer type. Nothing read it: the surface it was built for now
shows the `gh`-verified session fact instead, and the wire's `prUrl` survives
only as the ephemeral hint that asks that writer to look again. A decoder whose
only caller is its own test is decoration, and decoration drifts from the thing
it claims to describe, so it is deleted along with its types. The daemon may
keep sending the field; a snapshot that carries it decodes exactly as one that
does not, and neither is refused.

The PR details drawer's `gh unavailable` / `gh auth needed` / `unsupported
remote` / `unknown` labels stay, and now say why: no build writes those statuses
any more, but `workspace_pull_requests` is durable and earlier builds did, so
those rows are still read by this drawer. Dropping the labels would not remove
the rows — it would only render them as a bare state beside a status word the
reader cannot place.

And a `found` reply from `gh` that cannot become a fact now names the part that
is missing. One message covered all of them, so a pull request carrying a
perfectly good number whose state this build could not classify was reported as
"gh answered without a PR number". A missing number, a missing URL and an
unusable state each say their own name.
