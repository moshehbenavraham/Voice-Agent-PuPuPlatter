/**
 * 60db Voice Provider Type Definitions
 *
 * The 60db tab is a conversational agent assembled from primitives:
 *   mic -> VAD -> 60db STT -> Claude (brain) -> 60db streaming TTS -> playback
 *
 * Types here follow the established provider pattern (see types/gemini.ts) so the
 * UI components and reducer stay consistent with the other voice providers.
 */

import type { VoiceMessage } from './voice-provider';

// =============================================================================
// CONNECTION STATUS
// =============================================================================

/**
 * - `listening` - mic is open, waiting for / capturing the user's turn
 * - `thinking`  - transcribing the utterance and generating Claude's reply
 * - `speaking`  - streaming 60db TTS audio back to the user
 */
export type SixtyDbConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'disconnecting'
  | 'error';

// =============================================================================
// VOICE CATALOG (from GET /api/60db/voices -> /myvoices)
// =============================================================================

export interface SixtyDbVoice {
  voice_id: string;
  name: string;
  category?: string;
  model?: string;
  labels?: {
    language?: string;
    language_name?: string;
    gender?: string;
    accent?: string;
  };
  description?: string | null;
}

// =============================================================================
// STATE
// =============================================================================

export interface SixtyDbVoiceState {
  status: SixtyDbConnectionStatus;
  isConnected: boolean;
  isLoading: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  isThinking: boolean;
  isMuted: boolean;
  messages: VoiceMessage[];
  /** Partial assistant reply shown while it is being spoken. */
  activeTranscript: string;
  error: string | null;
  volume: number;
}

export interface SixtyDbVoiceContextValue extends SixtyDbVoiceState {
  selectedVoice: string;
  setVoice: (voice: string) => void;
  systemPrompt: string;
  setSystemPrompt: (prompt: string) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  toggleMute: () => void;
  setVolume: (volume: number) => void;
  clearError: () => void;
  /** Output AnalyserNode (assistant audio) for optional visualization. */
  getOutputAnalyser: () => AnalyserNode | null;
  /** Input AnalyserNode (microphone) for optional visualization. */
  getInputAnalyser: () => AnalyserNode | null;
}

export type SixtyDbVoiceHookReturn = SixtyDbVoiceContextValue;

// =============================================================================
// REDUCER ACTIONS
// =============================================================================

export type SixtyDbVoiceAction =
  | { type: 'SET_STATUS'; payload: SixtyDbConnectionStatus }
  | { type: 'SET_SPEAKING'; payload: boolean }
  | { type: 'SET_LISTENING'; payload: boolean }
  | { type: 'SET_THINKING'; payload: boolean }
  | { type: 'SET_MUTED'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_VOLUME'; payload: number }
  | { type: 'ADD_MESSAGE'; payload: VoiceMessage }
  | { type: 'SET_ACTIVE_TRANSCRIPT'; payload: string }
  | { type: 'RESET' };

// =============================================================================
// INITIAL STATE
// =============================================================================

export const SIXTYDB_INITIAL_STATE: SixtyDbVoiceState = {
  status: 'idle',
  isConnected: false,
  isLoading: false,
  isSpeaking: false,
  isListening: false,
  isThinking: false,
  isMuted: false,
  messages: [],
  activeTranscript: '',
  error: null,
  volume: 0.7,
};
