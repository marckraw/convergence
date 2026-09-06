---
'convergence': patch
---

Codex sessions no longer restart the Codex process on every message. Convergence now keeps one `codex app-server` per account for as long as the app is open, and every Codex session is a thread on it: the first message of a session waits once while the server warms up (and says so), and every message after that goes straight out instead of paying a 7–25 second process start. Releasing a session unsubscribes its thread rather than killing anything, so one session ending can no longer disturb another, and a session that fails leaves the server alone.

If the server does die, every open Codex session says so in the words the process itself used on the way out, and the next message brings a new one up and resumes the conversation where it was. A message that was already accepted by Codex when the connection dropped is now recognised and adopted instead of being sent a second time. If only the connection dies while the server keeps running, the turn it was carrying ends and says so, instead of leaving the session spinning on an answer that can never arrive.

Quitting Convergence takes the whole Codex server with it: the app asks it to leave, and a server wedged on its own state is stopped along with the process that actually holds the port, so no Codex server is left running after you quit.

Codex usage limits are read from the same server. The old fallback that read `~/.codex/auth.json` and called an undocumented endpoint with the raw access token is gone; a failed usage read now says what failed. Codex 0.153 or newer is required for Codex sessions — an older CLI is refused with a message that names the version, rather than silently behaving differently.
