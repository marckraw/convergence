# Codex account continuity probe

Use this probe to distinguish a readable shared transcript from the context a
resident Codex server actually sends on the next turn. The investigation and
feature decisions are tracked in [MAR-3010](https://linear.app/marckraw/issue/MAR-3010).

## Run

Install dependencies using the Node version in `.nvmrc`, then run from the repo
root with that same runtime:

```sh
fnm exec --using "$(cat .nvmrc)" -- node apps/convergence/tools/probe-codex-account-continuity.mjs --capture-input
```

The probe resolves Codex from the login-shell PATH. Set `CVG_CODEX_BINARY` to an
absolute executable path to select a particular installed CLI. The result records
the exact binary, CLI and Node versions, repository commit, and source hashes.

This command launches its own temporary Codex servers, not the Electron dev app.
It uses fresh unauthenticated homes, strips credential environment variables, and
shares only the synthetic `sessions` directory between those homes. Model requests
go to an in-process loopback Responses fixture that never proxies traffic. The
fixture refuses authorization headers, unexpected routes, and unexpected models.
It emits synthetic text and never executes tools. Existing accounts, conversation
files, and app processes are not used or stopped.

## What it checks

1. Complete a synthetic turn on server A; unsubscribe its client.
2. Resume the same native thread on server B and complete another synthetic turn.
3. Return to A while both servers remain resident. Compare the outbound input
   with B's user and assistant items, alongside `thread/read` and the disk log.
4. Send malformed SSE on a separate fixture thread. The turn must fail explicitly.
5. Stop only the probe-owned A server, then resume through a fresh A server. This
   cold control must include both B items, distinguishing stale resident context
   from a broken fixture or missing history on disk.
6. Resume the unrelated idle sibling on the fresh server with its original native
   ID. Its outbound input must retain its earlier user and assistant items.

A separate synthetic thread completes a turn and stays loaded on A until the
cold-control restart. All A clients are closed before that restart.
That is a narrow lifecycle check; it does not demonstrate real concurrent agent
work or authenticated account isolation. The probe asserts seven loopback requests
and no `previous_response_id` dependence before judging the full outbound input.

Without `--capture-input`, the probe injects raw synthetic history without starting
turns. That mode can inspect storage and residency, but its verdict is explicitly
`inconclusive-model-context`.

## Evidence and interpretation

The printed temporary directory contains `result.json`, the verbatim outbound
`input` arrays in `outbound-inputs.json` (keyed by home, thread, and turn), and
intermediate thread snapshots. These are synthetic diagnostic artifacts and are
retained for review. All probe-owned servers are stopped before the script exits.

Exit zero means the experiment and its controls completed. Read `verdict`:

- `fresh-outbound-context`: returning A included B's user and assistant items.
- `stale-outbound-context`: returning A omitted at least one of those items.
- A nonzero exit with `error` means the experiment itself failed; it is not a
  continuity verdict.

Observed on **codex-cli 0.154.0**, with Convergence host code at `210eb332`:
both `thread/read` and disk contained B's turn, but returning resident A omitted
B's user and assistant items from its next request. Restarting the isolated A
server restored both. A readable transcript therefore does not certify that a
resident runtime has reloaded it.

Do not use the cold control as a product workaround: a resident account server
can carry other live conversations. A passing synthetic probe would still need
an authenticated A → B → A canary and concurrent-session verification before
account switching could be considered validated.

## Authenticated continuity canary

`tools/canary-codex-account-switching.mjs` complements the loopback probe with
six real model turns. It requires two explicitly prepared, isolated ChatGPT
profiles; it does not log in or copy credentials. The user must authenticate
both profiles first. Never point it at a production or ambient Codex home.

Under `CVG_CANARY_PROFILES`, prepare `account-a` and `account-b` as owner-only
directories. Each needs its own `auth.json`, produced by a user-run
`codex login` with that profile's `CODEX_HOME`. Configure
`cli_auth_credentials_store = "file"` in each profile's `config.toml`.
Both profiles' `sessions` entries must point to the same fresh test-only
directory. Nothing else is shared. Select two different ChatGPT accounts;
the canary refuses identical account IDs.

Run with the repository's Node version and an explicitly selected Codex binary:

```sh
CVG_CANARY_PROFILES=/absolute/path/to/isolated-test-profiles \
CVG_CODEX_BINARY=/absolute/path/to/codex \
fnm exec --using "$(cat .nvmrc)" -- node apps/convergence/tools/canary-codex-account-switching.mjs --run
```

The canary uses the actual `CodexServerHostRegistry` with a temporary user home
and stripped API-key environment. It checks `account/read` against each
profile's encoded ID-token claims and records only identity fingerprints.
This verifies configured authentication, not a billing receipt.

Random nonces are supplied only through controlled dynamic-tool responses.
B must recall the value learned on A. After restarting only the idle,
canary-owned A server, A must recall both values on the same native thread ID.
A separate B turn remains blocked on a controlled tool throughout the restart,
and an idle sibling on A must retain its earlier nonce after resuming.
No shell, file, browser, or agent tools are approved by the canary.

The temporary `result.json` records the six turn outcomes, native IDs, recall
checks, versions, source hashes, and owned-server cleanup. Profiles remain
signed in for further user-authorized tests; credentials are never included
in the evidence. A successful `authenticated-continuity-controls-passed`
verdict proves this controlled lifecycle, not the product's admission guard,
settings flow, or dispatch attribution. Those require separate verification.
