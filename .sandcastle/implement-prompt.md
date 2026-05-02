# Context

You are running inside a Convergence Agent Workboard Sandcastle run.
Convergence already selected the tracker issue and passed it into this prompt.
Do not query GitHub, Linear, Jira, or any external tracker unless the issue
itself explicitly requires external context.

## Issue

- Tracker: {{TRACKER_TYPE}} / {{TRACKER_NAME}}
- Key: {{ISSUE_KEY}}
- Title: {{ISSUE_TITLE}}
- URL: {{ISSUE_URL}}
- Labels: {{ISSUE_LABELS}}

## Body

{{ISSUE_BODY}}

# Task

Implement the issue in this repository.

## Workflow

1. Inspect the relevant files and existing tests.
2. Make the smallest coherent change that addresses the issue.
3. Add or update focused tests when the behavior has a reasonable test seam.
4. Run the relevant verification command(s). Prefer the repository's documented
   commands when they are clear.
5. Commit the completed change on the current Sandcastle branch.

## Commit Message

Use a single commit. Start the commit message with:

`RALPH: {{ISSUE_KEY}}`

Include a concise summary of what changed and any follow-up needed.

# Done

When the issue is complete and committed, output:

<promise>COMPLETE</promise>
