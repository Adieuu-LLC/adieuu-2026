# Contributing to Adieuu

Thank you for your interest in contributing to Adieuu. We welcome community participation, particularly around bug fixes, security improvements, and documentation.

## What We Accept

| Type | Accepted? | Notes |
|------|-----------|-------|
| Bug fixes | Yes | Please include clear reproductions or failing tests where possible (though be careful not to dox yourself, please!) |
| Security fixes | Yes | See [SECURITY.md](SECURITY.md) for responsible disclosure.|
| Documentation improvements | Yes | Typos, clarifications, self-hosting guides |
| Performance improvements | Yes | Please include benchmarks or profiling data, where possible! We run local benchmarks for consistency, but the add'l data is always really appreciated and utilized! |
| Feature requests | No | Submit feature ideas via the [in-app feedback and feature request tool](https://app.adieuu.com/feedback); we prioritize based on community feedback from there |
| New features (unsolicited PRs) | Generally no | We have a product roadmap and design constraints that make unsolicited features difficult to efficiently verify and merge. Same as above- use our feedback and feature requests tools in-app |

## Getting Started

1. Grab a spoon and fork the repository
2. Create a branch from `development` (not `main`)
3. Follow the setup in [README.md](README.md#getting-started)
4. Make your changes
5. Ensure `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass
6. Open a PR targeting `development`

## Pull Request Guidelines

- Keep PRs focused — one bug fix or improvement per PR
- Please be clear on the 'what' and 'why': even if clear to you, re-read it before submitting. Be precise.
- If fixing a bug, describe the reproduction steps and expected behavior
- Ensure all CI checks pass before requesting review
- Do not commit `.env` files, secrets, or `terraform.tfvars`

## Code Style

- TypeScript throughout; strict mode enabled
- Biome for formatting and linting (`packages/ui`)
- Code should be self-documenting where possible, but descriptive comments are fine
- Tests use Vitest (API, crypto, shared) and Playwright (UI, a11y)

## Commit Messages

Write clear, concise commit messages. We don't enforce a strict convention, but prefer:
- Present tense ("fix session expiry" not "fixed session expiry")
- A short summary line, optionally followed by a blank line and more detail

## License

By contributing, you agree that your contributions will be licensed under the same [PolyForm Noncommercial License 1.0.0](LICENSE) that covers the project.
