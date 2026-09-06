---
'convergence': patch
---

The copy and download buttons on transcript code blocks work again, and the empty band above a code block is gone. Since the monorepo move the stylesheet scanned Streamdown's components at a path that no longer existed, so the classes that make the button rail clickable and tuck it into the block's header were never generated: the rail sat as its own row with pointer events off, and the buttons inside inherited that. The stylesheet now scans the packages where they are installed, and a test pins that location so a future hoist cannot silently switch the buttons off again.
