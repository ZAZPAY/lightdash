import LicenseClient from './LicenseClient';

describe('local enterprise entitlement', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it.each([null, '', 'self-hosted-enterprise', 'invalid-or-expired-key'])(
        'enables EE without network validation for key %s',
        async (key) => {
            const fetch = vi.fn(() => {
                throw new Error('Network access must not be used');
            });
            vi.stubGlobal('fetch', fetch);

            const client = new LicenseClient();
            await expect(client.get(key)).resolves.toMatchObject({
                isValid: true,
                code: 'VALID',
            });
            expect(fetch).not.toHaveBeenCalled();
        },
    );
});
