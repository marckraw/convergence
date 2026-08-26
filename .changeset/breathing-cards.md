---
'convergence': patch
---

A working session card breathes in its crew's colour (MAR-2607).

**Mission Control now says who is busy from across the room.** A running card
carries a slow glare — one full inhale-and-exhale every 2.8s, drifting between
0.18 and 0.6 opacity — in the accent colour of the first crew holding it that
has one. A session no crew has coloured breathes in the room's working hue
instead, the same emerald the running status dot already wears, so "working"
never depends on someone having picked a colour.

**The colour has to be inline, and that is not a style preference.** A crew's
accent is a runtime string; a class name assembled at render time is a class
Tailwind never emits, so the card sets `--breathe-color` as an inline custom
property and the stylesheet only reads it. Every other knob — period, the two
opacities, blur, spread, the neutral hue — rides along from `CARD_BREATHE`, so
a round of "slower" or "subtler" is one line in one object and nothing else.

**The glare lives on a pseudo-element so the breath is cheap.** Animating
`opacity` on `::after` keeps it on its own layer, where the compositor repeats
it for free; animating the blurred shadow itself would re-paint every frame,
on every card, on a wall that can hold a hundred and seventy-five of them.

**Under `prefers-reduced-motion` the card still glows — it just holds still**,
resting at the top of the breath. The information survives and only the
movement goes: a reduced-motion rule that also dropped the shadow would delete
the fact that the session is working at all.
