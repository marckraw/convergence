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
  at 1440/1000/800/390px. It opens a local file, starts no server, and produces no
  visual approval. Marcin's live walkthrough remains the feel gate.

The sidebar glyph is the exact SVG exported from Figma file
`nizmdlM7yENFDQ4XQuFwoN`, frame `117:5`, node `I117:6;131:11645`.
Its 20px image is padded by 6px within a 32px toggle box.
