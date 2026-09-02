# Backpack Studio

The second body: a remote-only creation app. You type a sentence, an agent on a
machine of ours works on it, and the conversation is still there when you come
back.

Studio is UI-first and account-free by constitution: no Claude account, no
Codex, no GitHub, no API key, no daemon URL in the interface. v1 is hardcoded to
one daemon, and "hardcoded" means four environment variables the person using
the app never sees.

## Configuration

Read by the **main process only**, at launch. Set them in your shell, or in a
gitignored `.env` beside the app; the shell wins wherever both say something.

| Variable                         | Required | What it is                                                                          |
| -------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| `BACKPACK_STUDIO_DAEMON_URL`     | yes      | Base URL of the agents-daemon, e.g. `https://agents.backpack.automations.ef.design` |
| `BACKPACK_STUDIO_DAEMON_TOKEN`   | yes      | Bearer token for that daemon                                                        |
| `BACKPACK_STUDIO_DAEMON_PROJECT` | yes      | Directory **on the daemon** the Entity works in                                     |
| `BACKPACK_STUDIO_PROVIDER`       | no       | Provider id in the _daemon's_ namespace. Defaults to `claude`                       |

`BACKPACK_STUDIO_PROVIDER` is the daemon's own id, not a product name. The
daemon Studio is aimed at advertises `claude`, `codex`, `cursor` and `gemini`;
`claude-code` is not one of them and a start naming it is refused. If the
handshake finds the configured provider missing, the window says so and lists
the ids the daemon actually offers.

Any missing variable is named on screen at launch. The token is reported by
name and never by value — it lives in the main process, is sent only as an
`Authorization` header, and crosses neither the preload boundary nor the log on
disk.

## Where the record lives

`<userData>/conversations/<id>/` — one directory per conversation:

- `conversation.json`: the facts that never change (id, title, createdAt,
  provider). Written through a temporary file and renamed.
- `events.jsonl`: the wire event log, appended to and never rewritten. This is
  the truth. Status, timestamps and the transcript are all folded out of it, so
  there is no second copy of any of them to drift.

The store sits behind a `ConversationStore` interface. Files are the skeleton;
SQLite arrives with the extraction run.

## What this build does not do yet

Named here so nobody has to read the code to find out: no Narrator (the
transcript is raw), no SSO, no connectors, no projects, no attachments, no
approvals, no queued input while a conversation is working, no model or effort
selection, no Mission Control anything.

## Running it

```
npm run dev -w backpack-studio
```

from the repository root, with the variables above set.
