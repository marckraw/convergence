# Project Scripts Are Non-Interactive Runs

Convergence will model project scripts as project-scoped, manually defined command runs rather than as terminal tabs or imported `package.json` scripts.

Project scripts exist to turn repeated repository operations into durable UI actions. A script can run `npm run dev`, `./scripts/migrate.sh`, `docker compose up`, or any other shell command chosen by the user. The script definition belongs to the Convergence project record, not to the repository's package manager metadata.

The v1 runner is non-interactive. It streams stdout and stderr, tracks status, exposes logs, supports stop and re-run, and records enough run metadata for future cross-project load dashboards. It does not accept stdin, allocate a PTY, or promise full-screen terminal behavior.

This is separate from the first-class Terminal surface. Terminal remains the right abstraction for interactive shells, editors, REPLs, prompts, and commands where the user needs to type. Project scripts are the right abstraction for repeatable project operations that can run unattended.

The backend should therefore use a focused script-runner service with durable script definitions and run records. It may reuse shared utilities such as shell/path resolution and ring buffers, but it should not couple script execution to terminal pane state.

This leaves a clear upgrade path: a later phase can add PTY-backed or stdin-capable runs for selected scripts without making the non-interactive v1 more complex than needed.
