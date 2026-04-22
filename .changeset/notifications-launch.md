---
'convergence': minor
---

Add a full notifications system: toasts, sounds, inline pulses, dock badge
and bounce, system-level macOS notifications, and a settings panel with a
test-fire button. Notifications fire on agent attention transitions
(`finished` / `needs input` / `needs approval` / `errored`), respect a
suppression matrix tied to window focus and the active session, and
collapse bursts via a 5-second per-severity coalescer with a 3-per-minute
rate limit on system-level fires. A first-run onboarding card surfaces the
new settings; everything is opt-out per channel and per event.
