import { createDeepSeek } from '@ai-sdk/deepseek';
import { lightdashConfigMock } from '../../../../config/lightdashConfig.mock';
import { getDeepSeekModel } from './deepseek';
import {
    getAvailableModels,
    getCompactionModelMetadata,
    getModel,
} from './index';

vi.mock('@ai-sdk/deepseek', () => ({
    createDeepSeek: vi.fn(() => ({
        chat: vi.fn((modelId: string) => ({
            specificationVersion: 'v3',
            provider: 'deepseek.chat',
            modelId,
        })),
    })),
}));

const deepseekConfig = {
    apiKey: 'deepseek-key',
    modelName: 'deepseek-flash',
    baseUrl: 'https://api.deepseek.com',
    availableModels: ['deepseek-flash', 'deepseek-v4-pro'],
    customHeaders: {},
    supportsStreaming: true,
};

const baseCopilotConfig = lightdashConfigMock.ai.copilot;

const openaiAndDeepseekConfig = {
    ...baseCopilotConfig,
    defaultProvider: 'openai' as const,
    providers: {
        openai: baseCopilotConfig.providers.openai!,
        deepseek: deepseekConfig,
    },
};

describe('getDeepSeekModel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('creates the client with the configured key, URL and headers', () => {
        getDeepSeekModel({
            ...deepseekConfig,
            baseUrl: 'https://gateway.example.com',
            customHeaders: { 'x-route': 'deepseek' },
        });

        expect(vi.mocked(createDeepSeek)).toHaveBeenCalledWith(
            expect.objectContaining({
                apiKey: 'deepseek-key',
                baseURL: 'https://gateway.example.com',
                headers: { 'x-route': 'deepseek' },
            }),
        );
    });

    test('keeps provider defaults when no reasoning option is set', () => {
        expect(
            getDeepSeekModel(deepseekConfig).providerOptions,
        ).toBeUndefined();
    });

    test('enables high-effort thinking for extended reasoning', () => {
        expect(
            getDeepSeekModel(deepseekConfig, { enableReasoning: true })
                .providerOptions,
        ).toEqual({
            deepseek: {
                thinking: { type: 'enabled' },
                reasoningEffort: 'high',
            },
        });
    });

    test('disables thinking for minimal-reasoning calls', () => {
        expect(
            getDeepSeekModel(deepseekConfig, { minimalReasoning: true })
                .providerOptions,
        ).toEqual({ deepseek: { thinking: { type: 'disabled' } } });
    });
});

describe('DeepSeek alongside OpenAI', () => {
    test('lists models from both providers', () => {
        const models = getAvailableModels(openaiAndDeepseekConfig);

        expect(models.some((m) => m.provider === 'openai')).toBe(true);
        expect(
            models
                .filter((m) => m.provider === 'deepseek')
                .map((m) => [m.name, m.displayName, m.groupLabel]),
        ).toEqual([
            ['deepseek-flash', 'DeepSeek V4.1 Flash', 'DeepSeek'],
            ['deepseek-v4-pro', 'DeepSeek V4 Pro', 'DeepSeek'],
        ]);
    });

    test('serves an allowlisted DeepSeek model while OpenAI is the default', () => {
        const { model } = getModel(openaiAndDeepseekConfig, {
            provider: 'deepseek',
            modelName: 'deepseek-v4-pro',
        });

        expect(model.modelId).toBe('deepseek-v4-pro');
    });

    test('ignores a model name that is not configured', () => {
        const { model } = getModel(openaiAndDeepseekConfig, {
            provider: 'deepseek',
            modelName: 'caller-controlled-model',
        });

        expect(model.modelId).toBe('deepseek-flash');
    });

    test('honors a pinned DeepSeek model name', () => {
        const { model } = getModel(openaiAndDeepseekConfig, {
            provider: 'deepseek',
            modelName: 'deepseek-v4-flash',
            trustPinnedModelName: true,
        });

        expect(model.modelId).toBe('deepseek-v4-flash');
    });

    test('reports no compaction support', () => {
        expect(
            getCompactionModelMetadata(openaiAndDeepseekConfig, {
                provider: 'deepseek',
            }),
        ).toEqual({ supportsCompaction: false, contextWindowTokens: null });
    });
});
