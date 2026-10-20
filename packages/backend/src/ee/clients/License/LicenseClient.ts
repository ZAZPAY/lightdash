type License = {
    isValid: boolean;
    detail: string;
    code: string;
};

export default class LicenseClient {
    // This deployment grants EE access locally; no license server is consulted.
    public async get(_key: string | null): Promise<License> {
        return {
            isValid: true,
            detail: 'Enterprise functionality enabled locally',
            code: 'VALID',
        };
    }
}
