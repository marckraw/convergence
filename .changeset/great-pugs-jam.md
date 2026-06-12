---
'convergence': patch
---

Add Remote execution host settings: daemon base URL in App Settings, API token in Keychain, and a connection test that reports configuration, reachability, auth, and the daemon's provider listing. The RemoteExecutionHost is now constructed at startup from these settings; session host selection comes next.
