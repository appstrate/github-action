# Contributing

Thank you for your interest in contributing to the Appstrate GitHub Action.

## Development Setup

1. Clone the repository
2. Install dependencies: `bun install`
3. Type check: `bun run check`
4. Build: `bun run build`
5. Run tests: `bun test`

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with clear commit messages
3. Ensure `bun run check` and `bun test` pass
4. Update documentation if needed
5. Submit a PR with a clear description of the changes

## Coding Standards

- TypeScript strict mode
- No `any` types
- Use `@actions/core` for logging (not `console.*`)
- Add tests for new functionality

## Commit Messages

Use clear, descriptive commit messages. Reference related issues when applicable.

All commits must include a `Signed-off-by` line (DCO). Use `git commit -s` to add it
automatically. This certifies that you wrote the code or have the right to submit it
under the project's license.

## License

By contributing, you agree that your contributions will be licensed
under the Apache License 2.0.

All contributions are subject to the
[Developer Certificate of Origin (DCO)](https://developercertificate.org/).
