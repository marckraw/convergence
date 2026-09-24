# Work-block summary measurement harness

MAR-3392 / MAR-3388 CV2. Synthetic data only. This folder does not integrate a model into the app. The measured results are in `reports/`; the recommendation and human review table belong on the PR and Linear issue.

## Reproduce on Apple Silicon

Use the repository's `.nvmrc` Node version. The Swift helper needs an SDK with FoundationModels (Xcode 26 or newer) and macOS 26 or newer with its on-device model available. The measured machine uses Xcode 27 / Swift 6.4 and macOS 27. Python dependencies are pinned in `requirements.txt`.

From this folder:

```sh
python3.10 -m venv .venv
.venv/bin/python -m pip install --no-cache-dir -r requirements.txt
.venv/bin/python download-model.py
node generate-fixtures.mjs
swift build -c release --package-path apple-fm
node run.mjs apple
node run.mjs mlx
node mutate-path-check.mjs
```

Run candidates sequentially with no other benchmark or build running. Download is a separate step, excludes inference, requires no account, and checks the pinned revision, file sizes and weight SHA256. It refuses a download above 2 GB. Only the named model is downloaded, into this folder. The venv, weights, compiler products and local caches are ignored. MLX inference runs offline and disables implicit Hugging Face token use. No provider CLI or API is involved.

`prompt.txt` is the exact common prompt; only provider and tool records are appended. Fixture labels and truth sets are withheld. Claude uses pretty JSON inputs; Pi compact JSON; Cursor free text; Codex results only with commands as tool names. Truth paths include literal paths, their parent directories and basenames, plus literal listing entries. The generator is deterministic. Both candidates use greedy decoding and a 96-token response limit. Apple additionally uses a `@Generable` structure with one `sentence` field; MLX emits plain text. This decoding difference is intentional, not an identical-model comparison.

Each worker accepts JSONL `{id, prompt}` on stdin and emits `{id, sentence, generationMs, error?}` on stdout. A single request also works: close stdin after the JSON line. Workers retain model weights but start a fresh conversation/cache per block. All 20 blocks run in fixed order, three times (60 responses per candidate). No retry, truncation, sentence repair or rejection filtering improves the pass rate. Apple's first response is also the smoke result. An Apple availability/generation error is preserved verbatim and stops that candidate; MLX can still be run independently.

## Reading measurements

- Cold is **process-cold**, measured by the parent from process spawn to first response, including imports and model loading. Download and compilation are excluded. It is not a reboot-cold measurement: OS disk caches and Apple's shared inference service are not reset.
- Warm p50/p95 use nearest-rank percentiles over the other 59 successful round trips. Each row preserves wall time and worker generation time.
- `/usr/bin/time -l` captures process peak RSS (bytes on macOS) and user + system CPU seconds across the whole batch. Average CPU percentage is CPU seconds / batch wall seconds × 100, where 100% is one core. These are **worker process** measurements. Apple's inference service executes elsewhere, so its helper RSS/CPU substantially undercount total inference cost; they cannot establish that Apple uses less total memory or CPU than MLX. GPU/ANE time, battery impact and system-wide peak memory are unmeasured. MLX also records Metal's peak allocator bytes per response.
- The reports retain raw time output, hashes of fixtures/prompt/checker, host information, the pinned MLX file manifest, every sentence, each lexical verdict and runtime errors. Capture the environment again when rerunning; Apple controls its model revision.
- R2 is a lexical rejection gate: recognized slash/dotted paths and explicit file/folder mentions must occur in the truth set, answers must fit 14 whitespace-separated words, and multiple sentences/newlines fail. It does not infer arbitrary natural-language aliases for directories, prove that tool actions succeeded, verify counts or match actions to paths. A passing sentence can still invent an outcome. Human semantic review is required; the test suite deliberately demonstrates this limit.

The focused tests run in the app's pure config and therefore in the root `env -u CODEX_HOME npm run test:pure` gate. `mutate-path-check.mjs` temporarily skips path rejection, requires the invented-path test to fail, restores the source in `finally`, reruns the tests and writes the evidence. Do not run it concurrently with tests or inference. Node's native TypeScript stripping loads the same pure checker in the harness; no duplicate checker is maintained.

## Integration boundary

The app's naming service currently resolves a model then calls `provider.oneShot`. This local experiment is a separate subprocess protocol, not a provider/account integration. An eventual main-process caller would spawn a signed helper with stdin/stdout pipes, correlate request IDs, bound queue length and input size, handle cancellation/timeouts/crashes and check availability. Rendering must never wait synchronously for inference. A resident worker amortizes startup; per-block spawning trades that cost for reclaiming memory between calls. Both strategies still require a fresh conversation per block and rejection/fallback behavior.

The existing Electron builder configuration only unpacks `.node` modules and has no `extraResources`. A Swift helper would need a release build copied outside ASAR via `extraResources`, an executable path under `process.resourcesPath`, executable permissions, signing/notarization, and OS/hardware availability handling. The Intel app cannot run Apple's on-device model; packaging must preserve both existing update ZIPs. MLX would additionally need a distributable interpreter/runtime or native helper, architecture-specific MLX libraries and a separately managed, integrity-checked model download. None of that packaging is implemented or validated by this spike.

References: [Apple FoundationModels](https://developer.apple.com/documentation/foundationmodels), [MLX LM](https://github.com/ml-explore/mlx-lm), [selected model](https://huggingface.co/mlx-community/Qwen2.5-1.5B-Instruct-4bit).
