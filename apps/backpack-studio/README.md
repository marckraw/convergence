# Backpack Studio engineering notes

Run commands from the monorepo root after `eval "$(fnm env)" && fnm use`.
Marcin starts the app with `npm run dev -w backpack-studio`; agents do not start
its dev server.

## Conversations and configuration

The sign-in action remains the 500ms mock in `features/sign-in/sign-in.api.ts`.
It opens no browser and makes no authentication request; the S1 sign-in copy
stays unchanged until SSO lands. The first-request cards send their visible
brief, and the first-request and home composers start real conversations.
With saved conversations, sign-in opens home; the first-request screen is for
an empty record. The sidebar loads the local record, newest first. Open a conversation to read
its raw transcript or send a follow-up; sending is disabled while it works.
The plain conversation view uses the S1 design system, pending MAR-2861.

Main reads the following environment variables through
`electron/backend/config/studio-environment.service.ts`. It tries `.env`
beside the app, then in the working directory; explicit shell values win.

| Name                             | Purpose                                           |
| -------------------------------- | ------------------------------------------------- |
| `BACKPACK_STUDIO_DAEMON_URL`     | The backpack-automations daemon address           |
| `BACKPACK_STUDIO_DAEMON_TOKEN`   | Authentication, main process only                 |
| `BACKPACK_STUDIO_DAEMON_PROJECT` | Working directory on the daemon                   |
| `BACKPACK_STUDIO_PROVIDER`       | Optional daemon provider id; defaults to `claude` |

The renderer's one connection door is `shared/api/connection.api.ts`, reading
an evaluated live handshake over `studio:daemon-status`. Main probes `/health`
and authenticated `/v0/meta` through the shared client. Only the endpoint host
name and evaluated diagnostics cross IPC; URL and credentials have no fields
in the renderer contract. A missing configuration is reported by variable name.
A missing provider is reported with the names advertised by the daemon.

Press **Ctrl+Shift+D** for live Hello diagnostics. The unreachable checkbox
simulates the captured failure without changing the real handshake; unticking
returns to that live reading. No dev server is started by a verification tool.

## Local record and retry

`<userData>/conversations/<id>/conversation.json` holds immutable facts;
`events.jsonl` holds wire events and local `sent`, `refused`, `stream-exhausted`, `restarted`
facts. One fold derives both live and replayed status and transcript. The
record is hydrated independently of the handshake; running conversations
resume from their last recorded sequence. Closing Studio does not stop the
remote session.

The first append heals through the reader's first unparseable line, including
a fused middle line. A complete line missing only its newline is preserved.
Each conversation has one append queue in the store. The acceptance predicate,
healing, append and synchronous fold commit execute under that queue, so an
overlapping replay cannot write a sequence twice. SQLite remains a later
extraction; any replacement store must preserve that commit contract and drain
pending appends before shutdown.

Retries ask the daemon: a command receiving HTTP 404 starts a session, and a
start receiving HTTP 409 sends the command to the existing session and follows
it. A fresh start after a lost session records a visible notice that the agent's
earlier memory is gone on the server; old turns remain readable. Stream HTTP
401/403/404 ends the follow immediately with the daemon's sentence. A refused local record creation is retried before any append. Local facts
never decide whether the remote session exists. Approvals, attachments, queued
input and stopping a remote session remain outside this slice; raw request
items are shown without an action that would pretend to answer them.

## CSS and fonts

Studio uses Tailwind 4 and Backpack 4.8.0's compiled `global.css` and `button.css`
in a separate cascade layer. Backpack's shipped Tailwind 3 preset fails under
Tailwind 4 (`value.match is not a function`), so it is not loaded. All Studio
colors live in `src/shared/ui/studio-theme.css`; Backpack supplies its own
button tokens. The shared UI boundary re-exports Backpack's Button.
After Vite's own resolver returns nothing, `@tailwindcss/vite`'s enhanced-resolve
fallback uses only the `style` condition and rejects Backpack's import/require-only
CSS exports without these aliases.

Vite resolves the Book/Medium font assets beside Backpack's exported Button
entry, since Backpack ships fonts without public font subpath exports. The
fonts are bundled from the dependency and are never copied into source control.

Backpack and React are build-time dependencies: Vite bundles the renderer, so
electron-builder must not traverse their unused dependency trees into the app.
Only electron-updater remains an external runtime dependency.

The root overrides React and React DOM to the same version for shared test tooling.
This prevents Backpack's older transitive peers from hoisting React 18 above
React 19 consumers. Vite also deduplicates these modules in Studio.

## Verification

- `npm run test:unit -w backpack-studio`: backend/restart composition, rendered copy, live routing, fixture states,
  developer chord, inert controls, token declarations and literal-color guard.
- `npm run build -w backpack-studio`: production Electron and renderer bundles.
- `npm run test:design -w backpack-studio`: property canary against that production
  bundle. Uses installed Google Chrome on macOS, Playwright Chromium elsewhere
  (`npx playwright install chromium` if needed). Checks actual font loading,
  Backpack button styles, exported icon dimensions, runtime errors, and overflow
  at 1440/1280/1000/800/390px. It opens a local file, starts no server, and produces no
  visual approval. Marcin's live walkthrough remains the feel gate.

The sidebar glyph is the exact SVG exported from Figma file
`nizmdlM7yENFDQ4XQuFwoN`, frame `117:5`, node `I117:6;131:11645`.
Its 20px image is padded by 6px within a 32px toggle box.

## Releases and updates

Source stays in this monorepo. Studio's public installers and update feed live in
`marckraw/backpack-studio`; Convergence uses its own repository. The builder's
`publish` block generates `app-update.yml`, which `electron-updater` reads in
packaged Studio. No runtime feed override is set.

Changesets versions Studio independently. The shared tag resolver reads each
app's manifest against `HEAD^` and skips existing tags: `v*` for Convergence,
`studio-v*` for Studio. Tag Release explicitly dispatches the matching publish
workflow because tags pushed with the Actions token do not trigger workflows.
The Studio workflow signs and notarizes both Mac architectures with the same
Developer ID as Convergence, then creates or updates the release in the public
Studio repository. The source tag is in this monorepo; the release repository's
tag labels its README commit, so cross-repository publication omits `--verify-tag`.

`npm run package:mac:unsigned -w backpack-studio` must leave both ZIPs in
`apps/backpack-studio/release/latest-mac.yml`. Both packaging commands verify
that each manifest entry matches an actual asset name and size before upload.
Artifact names use `Backpack-Studio` so GitHub and the manifest agree.
Signing, notarization, release
creation and an installed app's update require the release workflow and a real
release; ordinary PR CI proves none of those steps.

The updater checks ten seconds after launch and every four hours. Download and
restart each require the banner's button; automatic download and installation
on quit are disabled. Development builds do not check the network. The minimal
Studio adapter owns no Convergence settings or channels; shared extraction is
tracked in MAR-2859.

The window's preferred 1440×960 size is clamped to the primary display's work
area, with a 1280×800 minimum. Shorter windows scroll vertically. Width comes from
the frozen frames: 650px story + 490px panel content + two 70px gutters. This is
also above the home cards' 1100px breakpoint. Media queries remain for smaller
surfaces; the property check exercises onboarding, home and the conversation view at the native minimum.
