# Bugfix: Provider and Main-Init Error Surfacing

> Parent: `docs/specs/project-spec.md`
> Scope: two targeted bug fixes. No feature work, no refactors beyond the minimum required to test the fixes.

## Objective

Stop silent failures in two hot paths where errors currently leave the user with no signal:

1. **Codex provider `turn/start` rejection is swallowed.** If the JSON-RPC call fails after a user sends a message, the session status stays `running` indefinitely. The spinner never resolves, no transcript entry is emitted, and the user cannot tell the provider failed.
2. **Electron main-process init throws an unhandled promise rejection.** `app.whenReady().then(async () => { ... })` has no `.catch`. If database open, `hydrateProcessPathFromShell`, `detectProviders`, or IPC registration throws, the app launches with no window and no error message.

After this fix, both failure modes surface to the user through the same channels already used for known failures.

## Bug 1 — Codex `turn/start` silent catch

### Current behavior

`electron/backend/provider/codex/codex-provider.ts:557-567`

```ts
emit({ type: 'user', text, timestamp: now() })
setStatus('running')
setAttention('none')
rpc
  .request('turn/start', {
    threadId,
    model: config.model,
    effort: config.effort,
    input: [{ type: 'text', text, text_elements: [] }],
  })
  .catch(() => {})
```

- User types, message is emitted, status flips to `running`.
- If the RPC call rejects (connection dropped, invalid model/effort, transport error), the `.catch(() => {})` swallows it.
- `setStatus('running')` is never unwound.
- No system transcript entry, no log, no attention signal.

### Desired behavior

Match the pattern already used by `initialize()` in the same file (`codex-provider.ts:200-209`):

```ts
} catch (err) {
  if (stopped) return
  emit({
    type: 'system',
    text: `Initialization failed: ${err instanceof Error ? err.message : String(err)}`,
    timestamp: now(),
  })
  setStatus('failed')
  setAttention('failed')
}
```

The `sendMessage` turn-start failure should:

- Emit a system transcript entry: `Turn failed: <error message>`.
- Call `setStatus('failed')`.
- Call `setAttention('failed')`.
- No-op if `stopped` is true (matches existing guards).

### Acceptance criteria

1. When `turn/start` rejects, the session transitions from `running` to `failed` within one microtask.
2. A `TranscriptEntry` with `type: 'system'` is appended containing the error message.
3. `attention` is updated to `failed`.
4. If `stopped` was true when the rejection lands, no status, attention, or transcript side effects occur.
5. The `describe()` path and `initialize()` path are untouched.

## Bug 2 — Main init unhandled rejection

### Current behavior

`electron/main/index.ts:55-112`

```ts
app.whenReady().then(async () => {
  await hydrateProcessPathFromShell()
  const dbPath = join(app.getPath('userData'), 'convergence.db')
  const workspacesRoot = join(app.getPath('userData'), 'workspaces')
  const db = getDatabase(dbPath)
  // ... service wiring, provider detection, IPC registration, window creation
})
```

- No `.catch` on the promise chain.
- If any `await` throws (e.g. corrupted SQLite file, filesystem permission error, failed shell hydration), the process logs an `unhandledRejection` but Electron does not quit.
- No window is created. The user sees a dock icon on macOS and nothing else.

### Desired behavior

Wrap init in a top-level handler that, on failure:

1. Logs the error to stderr with full stack.
2. Calls `dialog.showErrorBox('Convergence failed to start', <formatted message>)` so the user sees a native modal before the app exits.
3. Calls `app.quit()` to drop the dock icon and avoid a zombie process.

`dialog.showErrorBox` is synchronous and safe to call after `app.whenReady()` has resolved, even if the failure happened inside the `.then` body.

### Acceptance criteria

1. A thrown error in the init chain triggers exactly one `dialog.showErrorBox` call with a non-empty message.
2. After the dialog, `app.quit()` is invoked.
3. The `stderr` log includes the original error stack.
4. The happy path (init succeeds) is unchanged — no extra dialog, no extra log line, no behavioral difference.
5. No new top-level error handlers are added globally (no `process.on('unhandledRejection')` listener); the fix is scoped to this init chain.

## Non-goals

- Do not refactor `initialize()` in `codex-provider.ts` to share an error helper with `sendMessage`. The two paths are small enough that duplication is cheaper than the abstraction.
- Do not change Claude Code provider. It already emits `system` + `failed` on stream errors (`claude-code-provider.ts` stream error path).
- Do not add retry logic. A failed turn is terminal for that message; the user can start a new session or provider-level continuation can reattach.
- Do not introduce a structured logger. Existing code uses `console.log` / `console.error`; match it.
- Do not change the session status state machine. `failed` already exists and the UI already renders it.

## Implementation notes

### Bug 1 implementation

- Replace `.catch(() => {})` at `codex-provider.ts:567` with a `.catch((err) => { ... })` that replicates the `initialize()` catch body, but with message prefix `Turn failed:` instead of `Initialization failed:`.
- Keep the `.catch` form rather than converting the method to `async` — the surrounding `sendMessage` closure is synchronous by design and we don't want to change its return shape.
- Guard with `if (stopped) return` inside the catch, matching other listeners.

### Bug 2 implementation

- Convert the `app.whenReady().then(async () => { ... })` chain to `app.whenReady().then(startApp).catch(handleStartupFailure)`, where `startApp` is the existing init body extracted as a module-local async function and `handleStartupFailure` formats the error + shows dialog + quits.
- `handleStartupFailure` must be sync-callable (no awaits) so it can run inside a `.catch` without its own unhandled rejection risk.
- `dialog.showErrorBox(title, content)` — title `Convergence failed to start`, content `<error.message>\n\n<error.stack>` trimmed to a reasonable size (no hard cap needed for Phase 0 bug fix; keep it simple).

## Testing strategy

This repo uses `vitest` with a pure/unit split (`npm run test:pure`, `npm run test:unit`). Bug 1 is testable in unit; Bug 2 is testable only with a pure helper because `electron.app`/`electron.dialog` cannot be imported in a Node test environment.

### Bug 1 tests

File: `electron/backend/provider/codex/codex-provider.error.test.ts` (unit).

Approach: follow the existing `jsonrpc.test.ts` seam style. The `CodexProvider.start` method creates an `rpc: JsonRpcClient` from `child.stdout`/`child.stdin`. For a focused test we do not need a real child process — we can extract the turn-failure handler into a small pure function and test it directly.

Preferred shape (pure extraction):

- Introduce `electron/backend/provider/codex/codex-errors.pure.ts` exporting:
  ```ts
  export function buildTurnFailureEntry(
    err: unknown,
    timestamp: string,
  ): TranscriptEntry
  ```
- Returns `{ type: 'system', text: 'Turn failed: <message>', timestamp }`.
- Wire it into the catch block.
- Unit test the pure function with three cases: `Error` instance, string rejection, unknown object.

This keeps the test in `test:pure` (fast, no Electron). The catch block in `codex-provider.ts` stays three lines.

### Bug 2 tests

File: `electron/main/startup-failure.pure.test.ts` (pure).

- Introduce `electron/main/startup-failure.pure.ts` exporting:
  ```ts
  export function formatStartupFailure(err: unknown): {
    title: string
    body: string
  }
  ```
- Unit test it with: `Error` with stack, `Error` without stack, string rejection, `undefined`.
- `index.ts` imports the pure helper; the side-effectful parts (`dialog.showErrorBox`, `console.error`, `app.quit`) stay in `index.ts` and are verified by running the app manually (documented in post-task command list below).

Both pure helpers are tiny (≤15 lines each). They exist purely to make the fix test-covered without mocking Electron.

## Post-task verification

Per `CLAUDE.md`, after every task:

```
npm install
npm run test:pure
npm run test:unit
chaperone check --fix
```

Manual verification for Bug 2 cannot be automated here. Document in the task summary:

- Manual check: run `npm run dev`, kill the process mid-boot with a broken `userData` dir, confirm native error dialog appears and app quits cleanly. (Optional — only if the reviewer wants a smoke check.)

## Boundaries

- **Always**: keep the fix within the two files identified; preserve existing import order; preserve existing `stopped` guards.
- **Ask first**: any change that alters `SessionStatus` values, the `TranscriptEntry` shape, or the `SessionHandle` contract.
- **Never**: add a global `process.on('unhandledRejection')` handler, add retry logic, refactor unrelated provider code, change Claude Code provider, touch the renderer.

## File inventory

New:

- `electron/backend/provider/codex/codex-errors.pure.ts`
- `electron/backend/provider/codex/codex-errors.pure.test.ts`
- `electron/main/startup-failure.pure.ts`
- `electron/main/startup-failure.pure.test.ts`

Modified:

- `electron/backend/provider/codex/codex-provider.ts` — replace `.catch(() => {})` at line 567.
- `electron/main/index.ts` — wrap `app.whenReady()` chain with `.catch` calling the new helper + `dialog.showErrorBox` + `app.quit`.

No other files are touched.
