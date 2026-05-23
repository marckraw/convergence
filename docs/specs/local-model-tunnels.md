# Local Model Tunnels

## Goal

Convergence can manage SSH local-forward tunnels for local or remote model
runtimes. The first concrete use case is forwarding local Ollama-compatible
traffic to a GPU workstation, but the feature must support multiple user-defined
tunnel profiles.

## UX

- Show an always-visible compact pill in the bottom global status bar.
- Clicking the pill opens a lightweight status popover.
- The popover shows each configured tunnel, its status, endpoint summary, and
  state-aware operational actions.
- Editing or managing profiles opens a larger dialog.
- The full dialog owns configuration: display name, SSH target, local bind,
  local port, remote host, remote port, health check URL, and autostart.
- The full dialog shows a command preview for inspectability.

## Tunnel States

- `stopped`: configured but no managed process is running.
- `starting`: Convergence spawned SSH and is waiting for process/health status.
- `running`: Convergence owns a live SSH process and the endpoint is available.
- `external`: the local endpoint is already available, but Convergence does not
  own the process.
- `failed`: the managed SSH process failed or the health check failed.

Convergence only stops or restarts processes that it started. An externally
available endpoint can be used by providers, but the UI must not offer to stop
an arbitrary process.

## Starter Profile

On first use, seed one editable starter profile:

- name: `Local model tunnel`
- SSH target: `my-gpu-host`
- local bind: `127.0.0.1`
- local port: `11434`
- remote host: `127.0.0.1`
- remote port: `11434`
- health check URL: `http://127.0.0.1:11434/api/tags`
- autostart: disabled by default

This is just a starter profile. Users can edit it or add more profiles.

## SSH Command

Managed starts use:

```bash
ssh -N -T -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=2 -L <localBind>:<localPort>:<remoteHost>:<remotePort> <sshTarget>
```

The local bind portion defaults to `127.0.0.1`.

## Backend Shape

- `electron/backend/local-model-tunnel/local-model-tunnel.types.ts`
- `electron/backend/local-model-tunnel/local-model-tunnel.pure.ts`
- `electron/backend/local-model-tunnel/local-model-tunnel.service.ts`
- `electron/backend/local-model-tunnel/local-model-tunnel.ipc.ts`

The service persists profiles through `StateService`, owns managed child
processes, probes local endpoints before starting, broadcasts status changes,
and stops owned processes on app quit.

## Renderer Shape

- `src/entities/local-model-tunnel/`
- `src/features/local-model-tunnel/`
- integration inside `src/widgets/global-status-bar/`

Renderer code talks to Electron only through `*.api.ts` and the preload bridge.
