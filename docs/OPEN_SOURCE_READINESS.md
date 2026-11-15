# Garage OS — Open-source readiness checklist

**Current state:** Source repository is public. Public visibility is not the same as an approved open-source release. The repository has not yet published a project-wide open-source license.

This document describes release gates, not a claim of completion.

## Ownership and scope

- [ ] Decide which software modules are suitable for open-source distribution.
- [ ] Separate reusable software from private operational configurations and business-specific documentation.
- [ ] Confirm ownership and redistribution rights for all code, assets, dependencies, fonts, images, and contributed materials.
- [ ] Define how Garage Coffee / Garage OS trademarks and brand assets may be used.
- [ ] Select an OSI-approved license after confirming applicable obligations.

## Security and privacy

- [ ] Perform a complete secret and sensitive-data audit of tracked files and Git history.
- [ ] Remove internal business records, personal information, production-only configuration, and private deployment materials from the public distribution.
- [ ] Rotate any credentials found to have been exposed; removing a file from the latest commit does not erase Git history.
- [ ] Review branch protection, GitHub Actions permissions, deployment triggers, and required reviewers.
- [ ] Ensure test data, seed users, and documentation are safe and clearly non-production.
- [ ] Enable private vulnerability reporting or publish a reliable private contact route.

## Developer experience

- [ ] Rewrite the main README around the intended public software scope and accurate setup instructions.
- [ ] Publish a sanitized example environment configuration with placeholders only.
- [ ] Document architecture, module boundaries, supported versions, and a local-only quick start.
- [ ] Run CI lint, type checking, unit tests, and dependency/security checks on a clean checkout.
- [ ] Publish a contribution policy and code of conduct.
- [ ] Tag the first public release only after all safety and licensing gates pass.

## Operational safeguard

The existing main-branch workflow deploys to a production VPS. Do not merge documentation, license, or community changes into `main` without reviewing the production deployment behavior and obtaining explicit maintainer approval.

## Status reporting

Do not claim community adoption, downloads, third-party dependencies, external contributors, production readiness, or open-source licensing unless each claim is supported by public evidence.
