# backpack-studio

## 0.2.3

### Patch Changes

- 3299194: Remote sessions speak execution-host protocol 0.31, and a remote Claude session's subagents and background tasks now show up like a local one's. When it spawns an agent, the agent's tool calls carry "↳ description (type)", and the parallel-work panel lists the session's agent runs and tasks, from the host's own record of them. Its counts still hold after Convergence restarts. On a host that takes it, Stop on one task stops just that task; on one that does not, Stop says the remote host cannot, instead of blaming a Claude Code version.

## 0.2.2

### Patch Changes

- 6eef9fe: Remote sessions speak execution-host protocol 0.23. A remote Claude session whose answer leaves background work running now reads "answered · N tasks running" in the sidebar and Mission Control, like a local one, instead of having its state refused, and still says so after Convergence restarts. When Claude Code reports back on that work by itself, the turn counts as part of the same answer, and the session settles to completed only once the work ends; a plan still waiting for review stays waiting through that settle. Stopping an answered session, local or remote, settles it as completed with its answer delivered. Backpack Studio shows an answered conversation as "Answered, still working", keeps following it until it settles, and lets you send a message meanwhile.

## 0.2.1

### Patch Changes

- 3abdc8b: Remote sessions never skip an event, and a stream that has stopped delivering
  gives up instead of re-dialling forever; a stream that gives up while frames
  are still missing says where the hole is, whether it stopped mid-read or could
  not be re-opened at all, and a healed gap no longer erases a frame nobody could
  read; the connection test counts only available providers

## 0.2.0

### Minor Changes

- 62a3a5a: Studio talks to the daemon: a sentence typed on the first-request screen becomes a conversation an agent on the VPS answers. Conversations and their transcripts survive an app restart.

## 0.1.0

### Minor Changes

- c663551: Backpack Studio's first release
