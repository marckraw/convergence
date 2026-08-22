---
'convergence': patch
---

The two React hook lint rules finally run on this renderer (MAR-2545).

No user-visible change. `eslint-plugin-react-hooks` was never in the dependency
tree, so `rules-of-hooks` and `exhaustive-deps` had never run against a renderer
built almost entirely from `useCallback`, `useMemo` and `useEffect`. That is the
gap a stale closure slipped through in the Quiet toggle: the switch showed quiet
while the message dispatched unmuted, because the send callback read a value its
dependency array never refreshed — correct on screen, wrong in the payload, and
invisible to review.

Both rules now run in `npm run lint` and in `chaperone check`.
`rules-of-hooks` is an error; the codebase has **zero** violations of it today.
`exhaustive-deps` is a warning, and there are **19**, none of them the
missing-dependency kind that caused the Quiet bug. Nothing was mass-edited to
clear them: adding a dependency can turn a mount-once effect into a render loop,
so that burn-down is attended work, filed separately.

Only those two rules are enabled, not the plugin's `recommended-latest` preset —
v7 ships the whole React Compiler rule set, which is a decision rather than a
default.
