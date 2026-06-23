/**
 * Voice Provider Type Definitions
 *
 * These types abstract voice provider functionality for type-safe
 * multi-provider support. Each provider implements these interfaces
 * to enable consistent switching between voice services.
 */

/**
 * Union type of all supported voice providers
 */
export type ProviderType =
  | 'elevenlabs'
  | 'elevenlabs-sdk'
  | 'sixtydb'
  | 'xai'
  | 'openai'
  | 'openai-translation'
  | 'ultravox'
  | 'vapi'
  | 'retell'
  | 'gemini';

/**
 * Canonical provider ordering for navigation.
 */
export const PROVIDER_ORDER = [
  'elevenlabs',
  'elevenlabs-sdk',
  'sixtydb',
  'xai',
  'openai',
  'openai-translation',
  'ultravox',
  'vapi',
  'retell',
  'gemini',
] as const satisfies readonly ProviderType[];

/**
 * Message role type for conversation messages
 */
export type MessageRole = 'user' | 'assistant' | 'function';

/**
 * Function call status
 */
export type FunctionCallStatus = 'pending' | 'executing' | 'completed' | 'error';

/**
 * Represents a function call made by the voice agent
 */
export interface FunctionCall {
  /** Unique call ID from the provider */
  callId: string;
  /** Name of the function being called */
  name: string;
  /** Arguments passed to the function (JSON object) */
  arguments: Record<string, unknown>;
  /** Result returned from function execution */
  result?: unknown;
  /** Error message if function failed */
  error?: string;
  /** Current execution status */
  status: FunctionCallStatus;
}

/**
 * Individual message in a voice conversation
 */
export interface VoiceMessage {
  /** Unique identifier for the message */
  id: string;
  /** Who sent the message */
  role: MessageRole;
  /** Message text content */
  content: string;
  /** Timestamp when message was created */
  timestamp: number;
  /** Function call data (when role is 'function') */
  functionCall?: FunctionCall;
}

/**
 * Connection lifecycle states for voice providers
 */
export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnecting' | 'error';

/**
 * Voice provider state interface
 * Tracks the current state of a voice provider connection
 */
export interface VoiceProviderState {
  status: ConnectionStatus;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  isSpeaking: boolean;
  isListening: boolean;
}

/**
 * Provider metadata and configuration
 */
export interface VoiceProvider {
  /** Unique provider identifier */
  id: ProviderType;

  /** Display name for UI */
  name: string;

  /** Short description of the provider */
  description: string;

  /** Whether this provider is currently available/enabled */
  isAvailable: boolean;

  /** Whether this provider requires API key configuration */
  requiresApiKey: boolean;

  /** Icon name (matches lucide-react icon names) */
  icon?: string;
}

/**
 * Provider configuration for the tab system
 */
export interface ProviderConfig {
  provider: VoiceProvider;
  isDisabled: boolean;
  disabledReason?: string;
}

function isEnabledEnvValue(value: unknown): boolean {
  return value === 'true' || value === true;
}

/**
 * Check if ElevenLabs Widget is enabled via environment variable.
 */
const isElevenLabsWidgetEnabled = (): boolean => {
  return isEnabledEnvValue(import.meta.env.VITE_ELEVENLABS_ENABLED);
};

/**
 * Check if ElevenLabs SDK is enabled via environment variable.
 */
const isElevenLabsSDKEnabled = (): boolean => {
  return isEnabledEnvValue(import.meta.env.VITE_ELEVENLABS_SDK_ENABLED);
};

/**
 * Check if the 60db provider is enabled via environment variable.
 */
const isSixtyDbEnabled = (): boolean => {
  return isEnabledEnvValue(import.meta.env.VITE_SIXTYDB_ENABLED);
};

/**
 * Check if xAI provider is enabled via environment variable.
 */
const isXAIEnabled = (): boolean => {
  return isEnabledEnvValue(import.meta.env.VITE_XAI_ENABLED);
};

/**
 * Check if OpenAI provider is enabled via environment variable.
 */
const isOpenAIEnabled = (): boolean => {
  return isEnabledEnvValue(import.meta.env.VITE_OPENAI_ENABLED);
};

/**
 * Check if OpenAI Translation provider is enabled via environment variable.
 */
export const isOpenAITranslationEnabled = (): boolean => {
  return isEnabledEnvValue(import.meta.env.VITE_OPENAI_TRANSLATION_ENABLED);
};

/**
 * Check if Ultravox provider is enabled via environment variable.
 */
const isUltravoxEnabled = (): boolean => {
  return isEnabledEnvValue(import.meta.env.VITE_ULTRAVOX_ENABLED);
};

/**
 * Check if Vapi provider is enabled via environment variable.
 */
const isVapiEnabled = (): boolean => {
  return isEnabledEnvValue(import.meta.env.VITE_VAPI_ENABLED);
};

/**
 * Check if Retell provider is enabled via environment variable.
 */
const isRetellEnabled = (): boolean => {
  return isEnabledEnvValue(import.meta.env.VITE_RETELL_ENABLED);
};

/**
 * Check if Gemini provider is enabled via environment variable.
 */
const isGeminiEnabled = (): boolean => {
  return isEnabledEnvValue(import.meta.env.VITE_GEMINI_ENABLED);
};

/**
 * Check if a value is a valid provider type.
 */
export function isProviderType(value: string): value is ProviderType {
  return PROVIDER_ORDER.includes(value as ProviderType);
}

/**
 * Check if a provider is enabled in the current Vite environment.
 */
export function isProviderAvailableInEnv(provider: ProviderType): boolean {
  switch (provider) {
    case 'elevenlabs':
      return isElevenLabsWidgetEnabled();
    case 'elevenlabs-sdk':
      return isElevenLabsSDKEnabled();
    case 'sixtydb':
      return isSixtyDbEnabled();
    case 'xai':
      return isXAIEnabled();
    case 'openai':
      return isOpenAIEnabled();
    case 'openai-translation':
      return isOpenAITranslationEnabled();
    case 'ultravox':
      return isUltravoxEnabled();
    case 'vapi':
      return isVapiEnabled();
    case 'retell':
      return isRetellEnabled();
    case 'gemini':
      return isGeminiEnabled();
  }
}

/**
 * Get provider tabs visible in the current environment.
 */
export function getVisibleProviderTypes(): readonly ProviderType[] {
  return PROVIDER_ORDER.filter((provider) => {
    if (provider === 'openai-translation') {
      return isOpenAITranslationEnabled();
    }

    return true;
  });
}

/**
 * Default provider configurations
 */
export const PROVIDERS: Record<ProviderType, VoiceProvider> = {
  elevenlabs: {
    id: 'elevenlabs',
    name: 'ElevenLabs Widget',
    description: 'Pre-built voice widget from ElevenLabs',
    isAvailable: isElevenLabsWidgetEnabled(),
    requiresApiKey: true,
    icon: 'AudioLines',
  },
  'elevenlabs-sdk': {
    id: 'elevenlabs-sdk',
    name: 'ElevenLabs SDK',
    description: 'Custom voice UI with ElevenLabs React SDK',
    isAvailable: isElevenLabsSDKEnabled(),
    requiresApiKey: true,
    icon: 'Mic',
  },
  sixtydb: {
    id: 'sixtydb',
    name: '60db',
    description: '60db STT + TTS with a Claude brain',
    isAvailable: isSixtyDbEnabled(),
    requiresApiKey: true,
    icon: 'Volume2',
  },
  xai: {
    id: 'xai',
    name: 'xAI',
    description: 'Grok-powered voice conversations',
    isAvailable: isXAIEnabled(),
    requiresApiKey: true,
    icon: 'Bot',
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    description: 'GPT-4o realtime voice conversations',
    isAvailable: isOpenAIEnabled(),
    requiresApiKey: true,
    icon: 'Sparkles',
  },
  'openai-translation': {
    id: 'openai-translation',
    name: 'OpenAI Translation',
    description: 'Realtime speech translation scaffold',
    isAvailable: isOpenAITranslationEnabled(),
    requiresApiKey: true,
    icon: 'Languages',
  },
  ultravox: {
    id: 'ultravox',
    name: 'Ultravox',
    description: 'Ultravox AI voice conversations',
    isAvailable: isUltravoxEnabled(),
    requiresApiKey: true,
    icon: 'AudioWaveform',
  },
  vapi: {
    id: 'vapi',
    name: 'Vapi',
    description: 'Vapi voice agent conversations',
    isAvailable: isVapiEnabled(),
    requiresApiKey: false,
    icon: 'PhoneCall',
  },
  retell: {
    id: 'retell',
    name: 'Retell',
    description: 'Retell AI voice agent conversations',
    isAvailable: isRetellEnabled(),
    requiresApiKey: true,
    icon: 'Phone',
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    description: 'Gemini Live voice conversations',
    isAvailable: isGeminiEnabled(),
    requiresApiKey: true,
    icon: 'Sparkle',
  },
};

/**
 * Default provider type
 */
export const DEFAULT_PROVIDER: ProviderType = 'elevenlabs';
