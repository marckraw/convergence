---
'convergence': minor
---

Enumerate Pi Agent models dynamically from the installed `pi` binary. When the provider descriptor is requested, Convergence now spawns a short-lived `pi --mode rpc --no-session` subprocess, sends `get_available_models`, and maps every returned Model to a `ProviderModelOption` with id `"provider/modelId"` and label `"Vendor · Name"`. Models flagged `reasoning: true` receive the full effort ladder (`none → high`), plus `xhigh` for OpenAI-provider models; non-reasoning models receive no effort options. If the probe times out, the binary fails to spawn, or pi returns an empty list (no credentials configured), Convergence falls back to the static `Pi default` descriptor so the picker stays usable. Session spawn now passes `--model <provider/id>` and `--thinking <level>` when the user picks something other than the fallback.
