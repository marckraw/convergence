# Cursor Agent latest-version source

Measured on 2026-09-20 (Europe/Zurich), for MAR-3244 on base `483230d6`.

Fetched `https://cursor.com/install` as text using
`curl -fsS https://cursor.com/install -o /tmp/cursor-install.txt`.
The script was never executed. No login or cookie was needed.

R1 answer: **yes**. The public installer names `2026.09.18-9a7762b`, in
the same date-and-hash shape as the CLI version. Its exact download assignment:

```sh
DOWNLOAD_URL="https://downloads.cursor.com/lab/2026.09.18-9a7762b/${OS}/${ARCH}/agent-cli-package.tar.gz"
```

R2 uses this assignment as the source. The parser accepts exactly one matching
download assignment, validates its calendar date, and returns null for an
unrecognized or ambiguous script. It does not evaluate shell text. The public
installer can change; a failed fetch or changed format produces an unknown
update status with a check error, never an inferred latest version.

The fetch uses the existing `fetchLatestProviderVersion` dispatch, the same
five-second timeout and HTTP-error result shape as the registry/release fetchers.

The existing semver comparator already orders numeric date components, but it
also lexically orders hash suffixes as prereleases. Cursor therefore uses a
separate comparison selected by its source kind. It compares validated dates
numerically (accepting single-digit month/day in CLI version inputs); equal
dates and hashes are current, while equal dates with different hashes are
unknown because hashes provide no release ordering. Malformed inputs remain
unknown. Other providers retain their existing semver behavior.
