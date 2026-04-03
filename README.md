# Appstrate GitHub Action

[![CI](https://github.com/appstrate/github-action/actions/workflows/ci.yml/badge.svg)](https://github.com/appstrate/github-action/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

Run [Appstrate](https://appstrate.dev) AI agents in your GitHub Actions workflows. Trigger any agent on pull requests and get results as check runs, inline annotations, and PR comments.

## Quick Start

```yaml
- uses: appstrate/github-action@v1
  with:
    appstrate-url: ${{ secrets.APPSTRATE_URL }}
    appstrate-api-key: ${{ secrets.APPSTRATE_API_KEY }}
    agent: "@myorg/my-agent"
```

On `pull_request` events, the action automatically collects PR metadata and the list of changed files, then passes them as input to the agent. The agent fetches the actual diff via its GitHub provider — no size limits.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `appstrate-url` | Yes | — | Appstrate instance URL |
| `appstrate-api-key` | Yes | — | API key (`ask_...`) |
| `agent` | Yes | — | Agent to run (`@scope/name`) |
| `agent-version` | No | latest | Version, dist-tag, or semver range |
| `input` | No | — | Additional agent input (JSON string, merged with PR context) |
| `config` | No | — | Agent config (JSON string) |
| `timeout` | No | `300` | Max wait time in seconds |
| `output-mode` | No | `full` | Reporting mode (see below) |
| `fail-on` | No | `fail` | When to fail the step: `fail`, `warning`, `never` |
| `verdict-path` | No | — | Dot-path to verdict in agent output |
| `summary-path` | No | — | Dot-path to summary in agent output |
| `annotations-path` | No | — | Dot-path to annotations array in agent output |
| `github-token` | No | `github.token` | GitHub token for reporting |

## Outputs

| Output | Description |
|--------|-------------|
| `run-id` | Appstrate run ID |
| `status` | Run status (`success`, `failed`, `timeout`, `cancelled`) |
| `result` | Agent result as JSON string |
| `duration` | Run duration in milliseconds |

## Output Modes

| Mode | Check Run | Annotations | PR Comment |
|------|-----------|-------------|------------|
| `full` | Yes | Yes | Yes |
| `check` | Yes | No | No |
| `annotations` | Yes | Yes | No |
| `comment` | No | No | Yes |
| `none` | No | No | No |

## How It Works

1. **Collect** — On PR events, fetches PR metadata and changed file list via the GitHub API
2. **Run** — Sends the context as input to the specified Appstrate agent (the agent fetches the diff itself via its GitHub provider)
3. **Stream** — Connects via SSE for live agent logs (falls back to polling)
4. **Report** — Maps the agent's output to GitHub check runs, annotations, and comments

### PR Context (automatic input)

On `pull_request` events, the action automatically builds and sends this input to the agent:

```json
{
  "repoOwner": "owner",
  "repoName": "repo",
  "repoFullName": "owner/repo",
  "repoDefaultBranch": "main",
  "prNumber": 42,
  "prTitle": "Add authentication",
  "prBody": "PR description...",
  "prAuthor": "username",
  "prBase": "main",
  "prHead": "feature/auth",
  "prHeadSha": "abc123",
  "prUrl": "https://github.com/owner/repo/pull/42",
  "prDraft": false,
  "changedFiles": "src/auth.ts\nsrc/middleware.ts"
}
```

Any `input` you provide is merged on top of this context.

### Output Mapping

By default, the action posts the full agent result as a PR comment and creates a check run based on the run status.

For structured reporting (verdict, annotations), configure mapping paths that point into the agent's JSON output:

```yaml
verdict-path: "verdict"           # e.g. output.verdict = "pass" | "fail" | "warning"
summary-path: "summary"           # e.g. output.summary = "No issues found"
annotations-path: "findings"      # e.g. output.findings = [{ path, line, level, message }]
```

Annotation objects should have: `path`, `line` (or `startLine`), `level` (`error`/`warning`/`notice`), `message`, and optionally `title`.

## Examples

### Basic — any agent, just run it

```yaml
- uses: appstrate/github-action@v1
  with:
    appstrate-url: ${{ secrets.APPSTRATE_URL }}
    appstrate-api-key: ${{ secrets.APPSTRATE_API_KEY }}
    agent: "@myorg/code-review"
    fail-on: "never"
```

### Structured — with annotations and verdict

```yaml
- uses: appstrate/github-action@v1
  with:
    appstrate-url: ${{ secrets.APPSTRATE_URL }}
    appstrate-api-key: ${{ secrets.APPSTRATE_API_KEY }}
    agent: "@appstrate/anti-leak"
    output-mode: "full"
    fail-on: "fail"
    verdict-path: "verdict"
    summary-path: "summary"
    annotations-path: "findings"
```

### Multi-agent — parallel jobs

```yaml
jobs:
  anti-leak:
    runs-on: ubuntu-latest
    permissions:
      checks: write
      pull-requests: write
      contents: read
    steps:
      - uses: appstrate/github-action@v1
        with:
          appstrate-url: ${{ secrets.APPSTRATE_URL }}
          appstrate-api-key: ${{ secrets.APPSTRATE_API_KEY }}
          agent: "@myorg/anti-leak"
          verdict-path: "verdict"
          annotations-path: "findings"

  architecture:
    runs-on: ubuntu-latest
    permissions:
      checks: write
      pull-requests: write
      contents: read
    steps:
      - uses: appstrate/github-action@v1
        with:
          appstrate-url: ${{ secrets.APPSTRATE_URL }}
          appstrate-api-key: ${{ secrets.APPSTRATE_API_KEY }}
          agent: "@myorg/architecture-review"
          fail-on: "warning"

  style:
    runs-on: ubuntu-latest
    permissions:
      checks: write
      contents: read
    steps:
      - uses: appstrate/github-action@v1
        with:
          appstrate-url: ${{ secrets.APPSTRATE_URL }}
          appstrate-api-key: ${{ secrets.APPSTRATE_API_KEY }}
          agent: "@myorg/style-check"
          output-mode: "check"
          fail-on: "never"
```

### Custom input — non-PR trigger

```yaml
on:
  workflow_dispatch:
    inputs:
      prompt:
        description: "What to analyze"

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: appstrate/github-action@v1
        with:
          appstrate-url: ${{ secrets.APPSTRATE_URL }}
          appstrate-api-key: ${{ secrets.APPSTRATE_API_KEY }}
          agent: "@myorg/analyzer"
          input: '{"prompt": "${{ github.event.inputs.prompt }}"}'
          output-mode: "none"
```

### Using outputs in subsequent steps

```yaml
steps:
  - uses: appstrate/github-action@v1
    id: review
    with:
      appstrate-url: ${{ secrets.APPSTRATE_URL }}
      appstrate-api-key: ${{ secrets.APPSTRATE_API_KEY }}
      agent: "@myorg/review"
      fail-on: "never"

  - if: steps.review.outputs.status == 'success'
    run: echo "Agent result: ${{ steps.review.outputs.result }}"
```

## Permissions

The action needs these GitHub token permissions for full reporting:

```yaml
permissions:
  checks: write          # Create check runs with annotations
  pull-requests: write   # Post PR comments
  contents: read         # Read PR metadata and file list
```

## License

Apache-2.0
