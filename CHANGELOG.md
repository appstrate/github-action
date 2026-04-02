# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-02

### Added

- Initial release
- Trigger any Appstrate agent from GitHub Actions
- Automatic PR context collection (diff, changed files, metadata)
- SSE streaming with polling fallback
- GitHub Check Run creation with verdict mapping
- Inline annotations on changed files
- PR comment creation (update-or-create)
- Configurable output mapping via dot-paths (`verdict-path`, `summary-path`, `annotations-path`)
- Configurable failure behavior (`fail-on`: fail, warning, never)
- Large diff truncation (`max-diff-size`)
- Example anti-leak agent with manifest, prompt, and workflow
