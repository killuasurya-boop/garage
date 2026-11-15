# Contributing to Garage OS

Thank you for your interest in Garage OS.

> **Licensing status:** This repository is publicly readable, but the project-wide open-source license and third-party asset review are not complete. Please do not assume that public access grants permission to redistribute or reuse the code. Formal code contributions will be accepted only after the maintainer publishes a contribution and licensing policy.

## Before contributing

- Read the README and existing documentation.
- Check existing issues before opening a new issue.
- Propose a narrowly scoped change with a clear reason and expected behavior.
- Never include customer information, employee records, business transactions, credentials, access tokens, production logs, or private branding assets in issues or pull requests.
- Do not test against live Garage Coffee systems or production databases.

## Proposed development workflow (once code contributions are enabled)

1. Open an issue describing the problem or proposed change.
2. Create a branch from the current default branch in your fork.
3. Make focused changes and add appropriate tests.
4. Run the checks used by this repository's CI: `npm ci`, `npx tsc --noEmit -p .`, `npm run lint`, and `npx vitest run` using a safe local development environment.
5. Submit a pull request describing the change, validation steps, and any breaking changes.

Maintainers review contributions based on relevance, security, maintainability, and test coverage. There is no guaranteed response time.

## Brand assets and data

The Garage Coffee and Garage OS names, original logos, and brand artwork are not automatically licensed for reuse with any future source-code license. Sample data must be synthetic and non-identifying.

## Security reports

Do not open public issues containing security vulnerabilities. See [SECURITY.md](SECURITY.md) for reporting guidance.
