---
'convergence': patch
---

fix(usage-insights): readable axes on activity charts

The Daily activity and Conversation balance charts now render a real time x-axis
with date ticks (Apr 4, Apr 11, …) instead of a numeric index axis that produced
fractional labels like `7.25` or `21.5`. The Provider usage chart, which used a
categorical x-axis that the underlying chart engine could not label, has been
replaced with an HTML grouped-bar visualization that lists each provider with
sessions and turns side by side.
