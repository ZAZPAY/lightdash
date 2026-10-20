# Syncing the ZAZPAY Lightdash fork

The sync workflow tracks `lightdash/lightdash:main` through the
`sync/lightdash-main` branch and opens or updates a PR into `development`.
It runs daily at 13:23 UTC and supports manual runs in GitHub Actions.
It does not merge PRs or deploy either environment.

## Initial setup

1. Create and push `development` from the fork's current `main`.
2. Adapt or disable the inherited release/publishing workflows before pushing
   setup changes to `main`. The inherited `release.yml` runs on pushes to `main`
   and is configured for Lightdash's publishing infrastructure.
3. Add `UPSTREAM_SYNC_TOKEN` as a GitHub Actions repository secret. Use a
   fine-grained token restricted to `ZAZPAY/lightdash`, with read/write access
   to Contents, Pull requests, and Workflows (upstream commits can change
   workflow files). Organization policy may require approval of the token.
   Set an expiration and rotate it before it expires.
4. Merge the sync workflow into the repository's default branch so its schedule
   and manual trigger are available. Scheduled workflows in forks may need
   enabling in the Actions tab.
5. Protect `development` and `main` with required PRs and working CI checks.
   Adapt inherited checks that require Lightdash-specific runners or secrets.
6. Run **Sync Lightdash into development** from the Actions tab.

The dedicated token lets PR CI run automatically instead of requiring approval
for workflow-created PR runs with the built-in `GITHUB_TOKEN`. See
[GitHub's token documentation](https://docs.github.com/en/actions/concepts/security/github_token).
Never commit the token to the repository.

For local work, configure the source remote once:

```sh
git remote add upstream https://github.com/lightdash/lightdash.git
git fetch upstream
```

Keep `development` tracking `origin/development`. The separate `upstream` remote
is the source of updates; it is not the destination for fork changes.

## Review and promotion

Merge sync PRs with **Create a merge commit**, preserving upstream ancestry.
Do not squash or rebase these PRs. Review changes to workflows along with code
and migrations. Tracking upstream `main` includes changes before they are
released; use release tags instead if a release-only cadence is desired.

If there are conflicts, resolve them on a temporary branch created from
`development`, merge `upstream/main` there, and submit that branch as a PR to
`development`. Keep `sync/lightdash-main` reserved for upstream commits.
Close any superseded sync PR after the conflict-resolution PR is merged.
The workflow uses ordinary fast-forward pushes; an upstream history rewrite
fails the sync rather than overwriting history.

Deploy `development` to dev, validate behavior and migrations, then open a
separate `development` → `main` PR using a merge commit. Promote the tested
image digest to production through the deployment pipeline. Bring production
hotfixes back into `development`.

Deployment pipelines, branch protections, separate databases/storage/secrets,
and production approval gates must be configured separately. This workflow
only delivers upstream changes for review.
