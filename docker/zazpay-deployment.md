# Zazpay container publishing and Argo CD deployment

Production runs in an existing GKE cluster through Argo CD. The infrastructure
inventory and secret resource IDs are maintained separately from this public
repository. Never commit secret values or service-account key files.

## Build and publication

The `Zazpay container` workflow builds `docker/Dockerfile.zazpay` for
`linux/amd64` on pull requests to `main`. It checks the non-root runtime UID and
runs the focused configuration and keyless EE unit tests before publication.
Pushes to `main` and manual runs on `main` publish the resulting image to:

```text
us-central1-docker.pkg.dev/p-bnpl/lightdash/lightdash
```

Tags include the full commit SHA, workflow run ID, and attempt. The repository
uses immutable tags. The workflow summary records the digest for GitOps
promotion. There is no mutable `latest` release tag.

Configure these GitHub repository variables before merging:

| Variable | Purpose |
| --- | --- |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Full GitHub OIDC provider resource name |
| `GCP_CONTAINER_PUBLISHER` | Dedicated image publisher service-account email |
| `LIGHTDASH_BUILD_RUNNER` | Optional runner label; default `ubuntu-24.04` |

The publisher requires `roles/artifactregistry.writer` on the container
repository and a federated `roles/iam.workloadIdentityUser` binding. Restrict the
OIDC provider to this repository, the main branch, and the publishing workflow.
Prefer stable repository/owner IDs in provider conditions. Runtime identities
must remain separate from publishing identities.

Use a runner with at least 4 CPUs, 16 GiB RAM, and approximately 50 GiB free disk.
Check actual GitHub-hosted capacity or configure an approved larger runner.
Untrusted pull requests must not execute on privileged shared self-hosted
runners. Inherited upstream PR workflows may require unavailable Depot runners
or upstream secrets; adapt required checks before enforcing merge protection.

The production image sets `NODE_ENV=production` and runs as UID/GID 10001. It
still contains build/test dependencies. Its default 3 GiB Node heap needs memory
headroom for native libraries. Validate temporary-file and dbt write paths with
the non-root runtime before deployment.

## Argo CD promotion

Publishing an image does not update the running application. Until the GitOps
repository and its access mechanism are configured, update the image digest
through a reviewed infrastructure PR:

1. Merge application changes from `development` into `main`.
2. Wait for container build, tests, and publication to succeed.
3. Copy the digest from the workflow summary into the GitOps manifests for the
   API, worker, and migration Job.
4. Merge the infrastructure PR; Argo CD reconciles that desired state.

Automate the promotion PR later with the team's existing image-update controller
or a narrowly scoped GitHub App installation token. The application workflow
does not have Kubernetes credentials or run `kubectl apply`.

## Runtime prerequisites

- Dedicated namespace and Kubernetes service account linked to the runtime
  Google service account through Workload Identity.
- Artifact Registry read access for the node identity.
- A dedicated PostgreSQL database/user and extensions `uuid-ossp`, `citext`,
  `ltree`, and `vector`.
- Cloud SQL Auth Proxy over private IP, authorized using Workload Identity;
  database password supplied separately through Secret Manager.
- Private GCS storage with object permissions and `signBlob` authorization.
  Configure `S3_AUTH_MODE=gcp_oauth`, the Google storage endpoint, bucket, region,
  and path-style access. No stored GCS key is needed.
- Secret Manager values for `LIGHTDASH_SECRET`, `PGPASSWORD`, and
  `AUTH_GOOGLE_OAUTH2_CLIENT_SECRET`. Use explicit versions and reference them
  through the existing External Secrets/store mechanism. Confirm the controller
  identity can read them and the generated Kubernetes Secret is ready.
- Production site URL, secure cookies, Google OAuth client ID and matching
  `/api/v1/oauth/redirect/google` HTTPS callback.

Run API and scheduler as separate Deployments:

```text
node packages/backend/dist/index.js
node packages/backend/dist/scheduler.js
```

Use `SCHEDULER_ENABLED=false` for the API and `true` for the worker. Run
`node packages/backend/dist/scripts/migrate/index.js up` once per release in a
controlled Job before deploying compatible workloads. Ensure its proxy sidecar
terminates when the Job finishes. Never run local demo seeds in production.

Leave license key/certificate unset. Local entitlement enables EE without a
validation request; feature flags and external integration credentials still
apply. Enable MCP and leave embedding disabled until explicitly required.
Configure an internal headless browser separately for screenshot/PDF features.

## First administrator and launch validation

Explicitly verify the intended administrator's organization role. The current
environment bootstrap requires an analytics-project configuration in addition
to the admin email; `LD_SETUP_PROJECTS=[]` does not satisfy it. Rehearse either
the application's first-organization flow under restricted initial access or
complete project-based bootstrap before general exposure.

Google OAuth audience and publishing settings may be shared with other
applications. Coordinate changes with their owners. Google test-user lists do
not replace application authorization for basic identity scopes.

Test SSO, organization access controls, warehouse queries, CSV signed downloads,
MCP through the ingress, pod restarts, and absence of license validation calls.
The local PostgreSQL/MinIO checks do not establish GCS or GKE readiness.
Set probes, resource limits, database connection limits, alerting, and backup
ownership. Verify restore procedures preserve the application encryption secret.

Rollback the GitOps digest only when schema compatibility permits. Incompatible
migrations require the database recovery plan and coordination with other users
of a shared PostgreSQL instance.

References:

- [GitHub Actions Google authentication](https://github.com/google-github-actions/auth)
- [Cloud SQL from GKE](https://docs.cloud.google.com/sql/docs/postgres/connect-kubernetes-engine)
- [GCS signing permissions](https://docs.cloud.google.com/storage/docs/authentication/creating-signatures)
