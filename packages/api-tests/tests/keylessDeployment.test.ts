import {
    ApiGetAsyncQueryResults,
    DashboardTileTypes,
    SEED_PROJECT,
} from '@lightdash/common';
import { ApiClient, Body } from '../helpers/api-client';
import { login } from '../helpers/auth';
import { mcpText, openMcpSession, personalAccessTokens } from '../helpers/mcp';

// Opt in only on the isolated, seeded local deployment.
describe.skipIf(process.env.TEST_KEYLESS_EE !== 'true')(
    'Keyless EE deployment',
    () => {
        let admin: Awaited<ReturnType<typeof login>>;
        const projectUuid = SEED_PROJECT.project_uuid;

        beforeAll(async () => {
            admin = await login();
        });

        afterAll(async () => {
            await Promise.all(
                personalAccessTokens
                    .splice(0)
                    .map(({ client, uuid }) =>
                        client.delete(
                            `/api/v1/user/me/personal-access-tokens/${uuid}`,
                        ),
                    ),
            );
        });

        it('reports EE enabled with the validation hosts unreachable', async () => {
            const response =
                await admin.get<Body<{ license: { valid: boolean } }>>(
                    '/api/v1/health',
                );
            expect(response.body.results.license.valid).toBe(true);
        });

        it('serves an embedded dashboard, queries its data, and exports CSV without a login cookie', async () => {
            const prefix = `/api/v1/embed/${projectUuid}`;
            const dashboards = await admin.get<
                Body<Array<{ uuid: string; name: string }>>
            >(`/api/v1/projects/${projectUuid}/dashboards`);
            const dashboard = dashboards.body.results.find(
                (item) => item.name === 'Jaffle dashboard',
            );
            expect(dashboard).toBeDefined();
            const created = await admin.post<Body<{ url: string }>>(
                `${prefix}/get-embed-url`,
                {
                    content: {
                        type: 'dashboard',
                        dashboardUuid: dashboard!.uuid,
                        canExportCsv: true,
                    },
                },
            );
            const token = new URL(created.body.results.url).hash.slice(1);
            const options = { headers: { 'Lightdash-Embed-Token': token } };
            const guest = new ApiClient();
            const embedded = await guest.post<
                Body<{
                    tiles: Array<{ uuid: string; type: DashboardTileTypes }>;
                }>
            >(`${prefix}/dashboard`, {}, options);
            const tile = embedded.body.results.tiles.find(
                (item) => item.type === DashboardTileTypes.SAVED_CHART,
            );
            expect(tile).toBeDefined();
            const started = await guest.post<Body<{ queryUuid: string }>>(
                `${prefix}/query/dashboard-tile`,
                {
                    tileUuid: tile!.uuid,
                    dashboardFilters: {
                        dimensions: [],
                        metrics: [],
                        tableCalculations: [],
                    },
                    dashboardSorts: [],
                    invalidateCache: true,
                },
                options,
            );
            const { queryUuid } = started.body.results;
            let result: ApiGetAsyncQueryResults | undefined;
            await vi.waitFor(
                async () => {
                    const response = await guest.get<
                        Body<ApiGetAsyncQueryResults>
                    >(
                        `/api/v2/projects/${projectUuid}/query/${queryUuid}`,
                        options,
                    );
                    result = response.body.results;
                    expect(result.status).toBe('ready');
                },
                { timeout: 90_000, interval: 1000 },
            );
            expect(result).toHaveProperty('rows');
            if (result?.status === 'ready')
                expect(result.rows.length).toBeGreaterThan(0);

            const scheduled = await guest.post<Body<{ jobId: string }>>(
                `/api/v2/projects/${projectUuid}/query/${queryUuid}/schedule-download`,
                { type: 'csv', onlyRaw: true },
                options,
            );
            let fileUrl: string | undefined;
            await vi.waitFor(
                async () => {
                    const response = await guest.get<
                        Body<{
                            status: string;
                            details: { fileUrl?: string } | null;
                        }>
                    >(
                        `/api/v1/schedulers/job/${scheduled.body.results.jobId}/status?projectUuid=${projectUuid}`,
                        options,
                    );
                    fileUrl = response.body.results.details?.fileUrl;
                    expect(response.body.results.status).toBe('completed');
                },
                { timeout: 90_000, interval: 1000 },
            );
            expect(fileUrl).toBeTruthy();
            const downloaded = await fetch(fileUrl!, options);
            expect(downloaded.status).toBe(200);
            expect(downloaded.headers.get('content-type')).toContain(
                'text/csv',
            );
            const csv = await downloaded.text();
            expect(csv.trim().split('\n').length).toBeGreaterThan(1);
        });

        it('initializes MCP and executes a real warehouse query', async () => {
            const call = await openMcpSession(admin, projectUuid);
            const chartApp = await call.readResource(
                'ui://render-chart/chart.html',
            );
            expect(chartApp.contents[0].text).toContain('<html');
            const result = await call('run_sql', {
                projectUuid,
                sql: 'select count(*) as local_ee_order_count from jaffle.orders',
            });
            if (result.isError) throw new Error(mcpText(result));
            expect(result.isError).not.toBe(true);
            expect(mcpText(result)).toContain('local_ee_order_count');
            expect(mcpText(result)).toMatch(
                /local_ee_order_count\r?\n[1-9]\d*/,
            );
        });
    },
);
