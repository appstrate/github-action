# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Removed

- The `config` action input. The platform collapsed manifest `config` into
  `input` (appstrate/appstrate#1179) and then closed the launch body
  (appstrate/appstrate#1189), so `config:` is now a 400 on the wire. Agent
  parameters go in `input:`; values fixed once per space are set on the
  platform via `PUT /api/agents/{scope}/{name}/input-settings`.
- `dist/sourcemap-register.js` — a byte-identical duplicate of the `.cjs` file
  `ncc` actually emits and `dist/index.js` actually requires. Nothing read it.

### Added

- A workflow still passing `config:` now fails with an error naming `input` as
  the replacement. Removing the declaration from `action.yml` is not enough on
  its own: the runner only warns about an undeclared `with:` key and still
  exports it as `INPUT_CONFIG`, so the value would otherwise be dropped in
  silence.
- Test coverage for `getInputs()` and for token-usage rendering.

### Changed

- Both example manifests migrated to AFPS 0.3: `schema_version`,
  `display_name`, `author`, `dependencies.integrations`,
  `integrations_configuration`, and `runtime_tools` in place of the retired
  1.x `schemaVersion` / `displayName` / `dependencies.providers` /
  `providersConfiguration` / `dependencies.tools`. Both declare `$schema` and
  validate against the platform's `validateManifest`.
- The code-review example pins its questions to a `pr_{prNumber}` slot instead
  of the fixed `checkpoint` key. Slots are keyed by `(agent, space, actor, key)`
  with no pull-request dimension, so a fixed key made two concurrent PRs under
  one API key overwrite each other.
- The example prompts and the README say "GitHub integration", the platform's
  current name for what they used to call a provider.
- Documentation uses `appstrate/github-action@main`. There are no tags and no
  releases, so `@v1` resolved to nothing.

### Fixed

- The README documented `verdict-path`, `summary-path` and `annotations-path`
  as having no default, and its copy-paste example set them to `verdict` /
  `summary` / `findings`. Both are wrong: the defaults are `output.verdict` /
  `output.summary` / `output.findings`, a run's persisted result nests the
  agent's output under `output`, and a non-empty `verdict-path` makes a verdict
  mandatory — so the documented example failed CI on a passing agent.
- Token reporting read a `tokensUsed` number the platform has never emitted. It
  now reads the real `token_usage` object and logs the per-bucket breakdown.
- `duration` is `number | null` on the wire, not `number`; the `duration` output
  is empty rather than the string `"null"` when the platform reported none.

## [0.1.0] - 2026-04-02

### Added

- Initial release
- Trigger any Appstrate agent from GitHub Actions
- Automatic PR context collection (metadata, changed file list)
- SSE streaming with polling fallback
- GitHub Check Run creation with verdict mapping
- Inline annotations on changed files
- PR comment creation (update-or-create)
- Configurable output mapping via dot-paths (`verdict-path`, `summary-path`, `annotations-path`)
- Configurable failure behavior (`fail-on`: fail, warning, never)
- Example anti-leak agent with manifest, prompt, and workflow
