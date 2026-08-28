---
'convergence': patch
---

The option row above the Execution Bar stops claiming things about a remote
machine it cannot back up (MAR-2682):

- A daemon that could not be re-asked now says so, above the providers it last
  reported, instead of showing a surviving list as though it were fresh.
- Fast mode and the Codex usage pill no longer appear on a remote session. Both
  are about the Codex CLI installed on this machine; neither reaches a daemon.
- Each remote provider is named after itself. Every one of them used to read
  "Remote daemon" — the machine's name, in the place the provider's belonged.
- A row that is still asking a machine what it runs now shows no local controls
  at all — the permission preset and its advanced panel go with the rest of the
  cluster, so the only thing left to operate is the strip itself.
- A provider a daemon reports as unavailable or signed-out is now refused when a
  session tries to start or send on it, quoting the daemon's own reason, instead
  of being let through and failing later — or, on a send, being let through
  silently and marking the session's relays quiet for a turn that never
  happened.
- A provider listing that comes back describing a different machine is refused
  rather than shown, and an execution host id is taken exactly as given or
  refused by name — including on the way out of the renderer, so the refusal is
  reachable from the product and not only from a direct IPC call.
- An execution host endpoint removed while its catalog was being fetched can no
  longer bring a connection to it back into existence.
- A start or a send that is refused because the daemon will not run the
  session's provider now leaves no trace of the attempt: it no longer
  un-archives the session on its way to rejecting it, and a refused start no
  longer writes a project-context note into the transcript for a turn that
  never happened.
- The endpoint connection test in Settings now counts the providers the daemon
  will actually run and names the ones it will not, instead of reporting a total
  that disagreed with the providers the composer offered for the same machine.
