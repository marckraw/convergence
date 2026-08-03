---
'convergence': patch
---

Claude provider accounts can now be enrolled, removed and attested. Enrolment
creates an isolated credential namespace, shares the whole agent profile by
symlink, and captures identity from the account's own configuration. A
fail-closed attestation pass disables an account that starts serving a
different identity, reports account-directory entries a future Claude release
invents, and warns when shared settings supply a credential that would make
account selection decorative. Provider status shows enrolled accounts by email
and organization; enrolment itself is a developer-console trigger until the
settings surface lands.
