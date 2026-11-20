import { createDeepSeek } from '@ai-sdk/deepseek';
import { DEFAULT_DEEPSEEK_BASE_URL } from '../../../../config/aiConfigSchema';
import { LightdashConfig } from '../../../../config/parseConfig';
import {
    createRequestSizeGuardedFetch,
    IMAGE_MODEL_REQUEST_MAX_BYTES,
} from './requestSizeGuard';
import { AiModel, ProviderOptionsMap } from './types';

const PROVIDER = 'deepseek';

const getThinkingOptions = (options?: {
    enableReasoning?: boolean;
    minimalReasoning?: boolean;
}): ProviderOptionsMap[typeof PROVIDER] | undefined => {
    if (options?.enableReasoning) {
        return { thinking: { type: 'enabled' }, reasoningEffort: 'high' };
    }
    if (options?.minimalReasoning) {
        return { thinking: { type: 'disabled' } };
    }
    // Provider default: thinking enabled at the model's default effort.
    return undefined;
};

export const getDeepSeekModel = (
    config: NonNullable<
        LightdashConfig['ai']['copilot']['providers']['deepseek']
    >,
    options?: { enableReasoning?: boolean; minimalReasoning?: boolean },
): AiModel<typeof PROVIDER> => {
    const deepseek = createDeepSeek({
        fetch: createRequestSizeGuardedFetch(
            IMAGE_MODEL_REQUEST_MAX_BYTES.deepseek,
        ),
        apiKey: config.apiKey,
        baseURL: config.baseUrl || DEFAULT_DEEPSEEK_BASE_URL,
        headers: config.customHeaders,
    });

    const providerOptions = getThinkingOptions(options);

    return {
        model: deepseek.chat(config.modelName),
        callOptions: {},
        providerOptions: providerOptions
            ? { [PROVIDER]: providerOptions }
            : undefined,
    };
};
