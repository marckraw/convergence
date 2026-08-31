# Dev sandbox — iterating beside the live app

Two Convergence instances can run at once, and during UI iteration they
should: the **stable app** keeps the real database and any live agent
sessions, while a **dev sandbox** instance previews the working tree and can
be restarted freely.

## The one hard rule

**One Convergence per userData directory, always.** On boot, every instance
marks running local sessions as failed ("Convergence restarted before the
provider process finished"). Two instances sharing a database therefore kill
each other's live sessions. The sandbox exists so this can never happen: it
gets its own userData via the `CONVERGENCE_USER_DATA_DIR` override
(`apps/convergence/electron/main/index.ts`, `resolveUserDataPath`).

Note that the dev build (`convergence`) and the packaged app (`Convergence`)
resolve to the _same_ userData folder on macOS's case-insensitive
filesystem — plain `npm run dev` and the installed app share one database
and must not run together. `npm run dev:sandbox` is the safe variant.

## Commands

```bash
npm run dev:seed      # snapshot the real app's data into the sandbox
npm run dev:sandbox   # start a dev instance on the sandbox userData
```

- `dev:seed` uses sqlite's `.backup` for a **consistent snapshot while the
  stable app keeps running** — never copy `convergence.db` with `cp`; WAL
  mode can tear a plain copy. Attachments and session outputs ride along so
  transcripts render. Reseed whenever the snapshot feels stale.
- `dev:seed` refuses to run while a sandbox instance holds the database
  open (checked with `lsof`); quit the sandbox or pass `--force`.
- The sandbox userData defaults to `~/.convergence-dev-sandbox`; both
  commands honor `CONVERGENCE_USER_DATA_DIR` to relocate it.
- The dev `.env` lives at `apps/convergence/.env` — both load candidates
  (`app.getAppPath()` and `process.cwd()`) resolve there under `npm run dev`,
  so a `.env` left at the repo root from before the monorepo move is never
  read.

## What the sandbox shares with the real app

| Data                                                          | Shared?                                |
| ------------------------------------------------------------- | -------------------------------------- |
| Sessions/projects database, attachments                       | snapshot copy — disposable             |
| Provider accounts + credentials (`~/.convergence/…`)          | **shared** (home-anchored by ADR 0007) |
| Provider CLIs and their state (`~/.claude`, `~/.codex`, PATH) | **shared**                             |

Consequence: sending a message inside a sandbox session genuinely runs a
provider turn on the real accounts and consumes real quota — it just writes
to the sandbox database. Treat the sandbox as look-mostly; talk when testing
send paths deliberately.

## The iteration loop

1. Stable app stays open — live conversations (mastermind, workhorses) run
   there and are never at risk.
2. `npm run dev:seed`, then `npm run dev:sandbox` in a terminal.
3. Agents edit the working tree from their sessions in the stable app.
   Renderer changes hot-reload the sandbox in ~1s;
   `apps/convergence/electron/` changes auto-restart **only the sandbox**.
4. Shipping still ends the classic way: gates, ship-it PR, review, merge.

Agents never run `npm run dev`, `dev:sandbox`, or `dev:clean` — launching
dev instances is the user's action (see AGENTS.md).
