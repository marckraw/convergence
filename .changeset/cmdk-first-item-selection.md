---
'convergence': patch
---

Fix Cmd+K command palette selection landing mid-list. cmdk preserved the previously selected value across re-renders, so when the curated view switched to the ranked view on typing, the highlight stayed on the old item instead of jumping to the top result. Now the selected value is controlled and reset to the first visible item whenever the view changes.
