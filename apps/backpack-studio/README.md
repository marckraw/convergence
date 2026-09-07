# Backpack Studio engineering notes

Run commands from the monorepo root after `eval "$(fnm env)" && fnm use`.
Marcin starts the app with `npm run dev -w backpack-studio`; agents do not start
its dev server.

## Design build boundaries

The sign-in action is a 500ms mock in `features/sign-in/sign-in.api.ts`.
It opens no browser and makes no authentication request. The first-request
cards are suggestions; Skip opens the home shell. Home controls are static
and carry an explanatory title.

Connection indicators read `shared/api/connection.api.ts`. This build evaluates
captured daemon health through the shared execution-host client. A connected
label describes that recorded evaluation; it does not prove current network
reachability. No endpoint credentials enter the renderer.

Press **Ctrl+Shift+D** to open or close the developer view. It preserves the
current screen and exposes the unreachable-fixture checkbox alongside the
original Hello diagnostics. The checkbox updates Hello immediately; return to compare connection
indicators on first-request or home. The selection lasts only for the current
app instance.

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

- `npm run test:unit -w backpack-studio`: rendered copy, routing, fixture states,
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

The window opens at 1440×960 and cannot resize below 1280×920. Width comes from
the frozen frames: 650px story + 490px panel content + two 70px gutters. This is
also above the home cards' 1100px breakpoint. Media queries remain for smaller
surfaces; the property check exercises all three screens at the native minimum.
