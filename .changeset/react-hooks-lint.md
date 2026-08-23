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

Both rules now run in `npm run lint` and in `chaperone check`, and a test pins
the configuration itself: ESLint is run over inline fixtures with the real repo
config, so deleting the rules is no longer a silent, all-gates-green edit.

`rules-of-hooks` is an error; the codebase has **zero** violations of it today.
`exhaustive-deps` is a warning, with **19** across 9 files: 14 of the identity
kind (a value that could change on every render), 4 where the dependency array
holds a complex expression, and 1 unnecessary dependency. None of them is a
reported missing dependency — but the 4 complex-expression warnings say the rule
could not analyse those arrays at all, so the honest claim is zero that the rule
could see, and a Quiet-shaped stale closure could still be sitting behind any of
the four. Extracting those expressions to named variables is the prerequisite
for trusting the zero, and it belongs to the burn-down, filed separately: nothing
was mass-edited here, because adding a dependency can turn a mount-once effect
into a render loop.

Only those two rules are enabled, not the plugin's `recommended-latest` preset —
v7 ships the whole React Compiler rule set, which is a decision rather than a
default.
