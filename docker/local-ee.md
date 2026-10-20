# Local keyless EE test deployment

From the repository root:

```bash
./scripts/local-ee-start.sh
```

Open http://localhost:18080 and sign in with `demo@lightdash.com` /
`demo_password!`. The script builds the modified source, starts isolated Postgres
and MinIO services, runs core and EE migrations, and seeds the Jaffle Shop demo
only when the application database has no users. It leaves existing Docker
projects alone. Docker needs approximately 8 GB RAM and sufficient free disk
space for the image and dependencies.

The Compose configuration enables embedding and MCP, leaves the license key and
certificate empty, and maps the Keygen and Lightdash validation hosts to loopback.
This is a local development image with source and test dependencies, not a
production image. Its HTTP and object-storage ports bind only to localhost.

Run the focused functional checks:

```bash
docker compose -f docker/docker-compose.local-ee.yml exec -T \
  -e TEST_KEYLESS_EE=true app \
  pnpm -F api-tests test:api tests/keylessDeployment.test.ts
```

The checks verify EE health, a dashboard query authenticated only by an embed
JWT, a scheduled CSV download with data, the MCP chart resource, and a warehouse
SQL query through an authenticated MCP session. They create and then revoke a
test personal access token. The MCP endpoint is
`http://localhost:18080/api/v1/mcp`; normal API authentication still applies.

To stop the stack while retaining the demo data:

```bash
docker compose -f docker/docker-compose.local-ee.yml down
```

The `lightdash-local-ee` Compose project stores its own database and object data
in named volumes. Rebuilding the image does not delete these volumes.
