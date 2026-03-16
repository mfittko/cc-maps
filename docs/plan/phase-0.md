# Phase 0: Repository Bootstrap

## Goal

Prepare the project for implementation by turning the local scaffold into a tracked GitHub repository for `Cross-Country maps`, using `cc-maps` as the repository and deployment alias, with baseline CI and the files needed for safe collaboration.

## Scope

1. Initialize the project as a git repository with a `main` branch.
2. Rename the working title from the scaffold branding to `cc-maps` in package metadata and repository-facing documentation.
3. Add `.gitignore` with standard Next.js and local environment exclusions.
4. Add `.env.local.example` to document required environment variables without committing secrets.
5. Add GitHub Actions CI to install dependencies and verify the app builds on pushes and pull requests.
6. Create the GitHub repository at `mfittko/cc-maps` and push the initial branch.

## Deliverables

- Local git repository initialized on `main`.
- GitHub repository created and connected as `origin`.
- Working title updated to `cc-maps`.
- Baseline `.gitignore`, `.env.local.example`, and CI workflow committed.

## Dependencies

- GitHub CLI authentication with permission to create repositories under `mfittko`.

## Risks

- Repository visibility must be chosen at creation time.
- CI cannot pass until dependency installation and build validation are completed locally or in workflow.
- No secrets should be committed during bootstrap.

## Verification

1. Confirm `git status` shows a valid repository on the `main` branch.
2. Confirm `gh repo view mfittko/cc-maps` succeeds after creation.
3. Confirm the default remote points to the new repository.
4. Confirm the working title in `package.json` and repo docs uses `cc-maps`.
5. Confirm the GitHub Actions workflow is present and valid.

## Out Of Scope

- Vercel project linking and deployment workflows.
- Product feature implementation.