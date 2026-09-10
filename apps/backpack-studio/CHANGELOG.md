# backpack-studio

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
