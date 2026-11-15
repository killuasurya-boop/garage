# Garage OS — Publication security review (2026-11-16)

**Status: NOT APPROVED for unrestricted public release.**

This is a preliminary, repository-based review. It is not a penetration test, a verified Git-history secret scan, a complete third-party asset audit, or a production server assessment.

## Confirmed review observations

1. The `main` branch is publicly accessible and contains application and operations source.
2. The main-branch deployment workflow automatically deploys to the production VPS and uses a privileged SSH account. This review does not change that workflow.
3. An internal franchise folder was present in the public repository and explicitly described its files as non-public.
4. Business documents, an uploaded PDF, generated artifacts, and local tooling settings were tracked in the public tree.
5. Some documentation exposes predictable historical development credentials. Assume they are compromised if ever used outside isolated testing.
6. The current production seed checks that some credential variables are set, but it did not reject their known historical default values.

## Changes proposed in this review branch

- Remove selected tracked internal documents and generated/runtime files from the future repository tree.
- Prevent the same paths from being added accidentally through `.gitignore`.
- Remove credential examples from the main README and add a public safety warning.
- Reject known legacy seed values when the seed script runs in production.
- Add a path/token precheck for PRs and a security reporting policy.

**Important:** `.gitignore` does not remove tracked files. A deletion commit does not erase file contents from earlier Git history, forks, archives, or caches. Nothing here verifies production secrets were rotated or that previously public personal information was fully remediated.

## Release gates — owner action required

- [ ] Temporarily make the existing repository private until its contents and history are audited.
- [ ] Securely review sensitive tracked material and past commits, including binary documents and uploaded PDFs.
- [ ] Rotate any production credential that matches a known default or may have been committed; inspect provider-side logs and revoke compromised keys.
- [ ] Create private backups of proprietary documents/assets before removing them from public distribution.
- [ ] Confirm removal of seed documents will not break application runtime, initial setup, or disaster-recovery workflows.
- [ ] Review production GitHub Actions and replace privileged deployment access with a least-privileged deploy identity, protected environments, and approval gates.
- [ ] Run tested local build, TypeScript, lint, unit tests, and environment-specific regression checks.
- [ ] Plan an authorized Git-history cleanup if necessary; obtain explicit approval before rewriting history or force-pushing.
- [ ] Verify third-party software/asset licenses and ownership before adding a repository-wide OSI license.
- [ ] Use a separate sanitized open-source release repository or publishing pipeline if the production system must remain private.

## Publication decision

Do not merge this PR into the production branch until file removals have been reconciled with operational dependencies, and do not announce that the repository is secure based only on this PR.

**Security posture:** Proposed improvements prepared; exposure in the existing public `main` and history remains until additional owner-controlled actions are completed.
