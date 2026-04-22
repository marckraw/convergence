# Notification chimes

Two short PCM WAV files used by the in-app `sound-soft` and `sound-alert`
notification channels.

| File              | Use case                              | Duration |
| ----------------- | ------------------------------------- | -------- |
| `chime-soft.wav`  | Info-severity events (finished, etc.) | ~300 ms  |
| `chime-alert.wav` | Critical events (errored)             | ~400 ms  |

Both files are mono, 16-bit PCM at 44.1 kHz. They were synthesised from
deterministic sine-wave envelopes — no third-party samples are used, so
there is no license to track. The generator script lives at
`tools/generate-notification-sounds.mjs`. Re-run it with `node` to
regenerate the assets if the synthesis parameters change.
