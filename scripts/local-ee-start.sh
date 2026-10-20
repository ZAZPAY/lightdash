#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
compose=(docker compose -f docker/docker-compose.local-ee.yml)
"${compose[@]}" build app
"${compose[@]}" up -d --wait db minio
"${compose[@]}" run --rm --no-deps --workdir /usr/app/packages/backend app node --input-type=module -e '
import { S3Client, HeadBucketCommand, CreateBucketCommand } from "@aws-sdk/client-s3";
const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
});
const Bucket = process.env.S3_BUCKET;
try { await client.send(new HeadBucketCommand({ Bucket })); }
catch (error) {
    if (error.$metadata?.httpStatusCode !== 404) throw error;
    await client.send(new CreateBucketCommand({ Bucket }));
}
'
"${compose[@]}" run --rm --no-deps app pnpm -F backend migrate-production up
seeded="$("${compose[@]}" exec -T db psql -U postgres -d lightdash -tAc 'SELECT EXISTS (SELECT 1 FROM users)')"
if [[ "$seeded" != t ]]; then
    "${compose[@]}" run --rm --no-deps app sh -ec '
        dbt deps --project-dir "$DBT_DEMO_DIR/dbt" --profiles-dir "$DBT_DEMO_DIR/profiles"
        dbt seed --project-dir "$DBT_DEMO_DIR/dbt" --profiles-dir "$DBT_DEMO_DIR/profiles"
        dbt run --project-dir "$DBT_DEMO_DIR/dbt" --profiles-dir "$DBT_DEMO_DIR/profiles"
        pnpm -F backend seed-production
    '
fi
"${compose[@]}" up -d app
curl --fail --silent --show-error --retry 30 --retry-connrefused --retry-delay 2 --max-time 5 \
    http://localhost:18080/api/v1/health >/dev/null
printf '%s\n' 'Local EE: http://localhost:18080' 'Login: demo@lightdash.com / demo_password!'
