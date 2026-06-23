/**
 * 60db Voice Agent Configuration
 *
 * 60db provides TTS + STT primitives (no LLM). This app composes them into a
 * conversational agent: mic -> VAD -> 60db STT -> Claude (brain) -> 60db TTS.
 *
 * TTS is streamed over a WebSocket relay using LINEAR16 (raw PCM16) so playback
 * can reuse the same gapless PCM streamer pattern as the other providers.
 *
 * @see https://docs.60db.ai/websocket-api/tts
 * @see https://docs.60db.ai/api-reference/stt/speech-to-text
 */

import { getApiBaseUrl } from '@/lib/apiConfig';

// =============================================================================
// Audio format
// =============================================================================

/** TTS playback sample rate (LINEAR16 PCM16 mono). 60db supports 8/16/24/48k. */
export const SIXTYDB_OUTPUT_SAMPLE_RATE = 24000;

/** WebSocket audio encoding requested from 60db (raw PCM16 little-endian). */
export const SIXTYDB_AUDIO_ENCODING = 'LINEAR16' as const;

// =============================================================================
// Voice synthesis defaults (mirror 60db create_context params)
// =============================================================================

export const SIXTYDB_DEFAULTS = {
  /** 0.5–2.0 */
  speed: 1,
  /** 0–100 (lower = expressive, higher = consistent) */
  stability: 50,
  /** 0–100 (output fidelity to source voice) */
  similarity: 75,
} as const;

/**
 * Default voice id. 60db voices are account-specific (see GET /myvoices), so the
 * concrete id must be supplied via VITE_SIXTYDB_VOICE. The selector lets the user
 * pick from their catalog at runtime.
 */
export const DEFAULT_SIXTYDB_VOICE =
  (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_SIXTYDB_VOICE as string)) || '';

/**
 * Default system prompt for the Claude brain. Tuned for spoken output.
 */
export const DEFAULT_SIXTYDB_SYSTEM_PROMPT =
  (typeof import.meta !== 'undefined' && (import.meta.env?.VITE_SIXTYDB_INSTRUCTIONS as string)) ||
  'You are a friendly, helpful voice assistant. Keep responses brief, natural, and ' +
    'conversational since they are spoken aloud. Avoid markdown, lists, and code blocks.';

// =============================================================================
// Voice Activity Detection (utterance segmentation)
// =============================================================================

/**
 * Energy-based VAD configuration. 60db STT is batch (needs a complete utterance),
 * so we segment the mic stream client-side: detect speech onset, then end the turn
 * after a sustained silence.
 */
export const SIXTYDB_VAD_CONFIG = {
  /** RMS threshold (0–1) above which a frame counts as speech. */
  speechThreshold: 0.015,
  /** Continuous speech (ms) required before a turn is considered started. */
  minSpeechMs: 200,
  /** Silence (ms) after speech that ends the turn and triggers transcription. */
  silenceMs: 900,
  /** Hard cap (ms) on a single utterance to bound STT cost/latency. */
  maxUtteranceMs: 30000,
} as const;

// =============================================================================
// WebSocket relay URL
// =============================================================================

/**
 * Build the relay WebSocket URL for streaming TTS. The browser never sees the
 * 60db API key; the backend relay injects it on the upstream connection.
 */
export function buildSixtyDbTtsWsUrl(): string {
  const base = getApiBaseUrl();

  // Same-origin (demo mode returns '') -> derive from the current page.
  if (!base) {
    if (typeof window !== 'undefined') {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}/api/60db/tts`;
    }
    return 'ws://localhost:3001/api/60db/tts';
  }

  const wsBase = base.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:');
  return `${wsBase}/api/60db/tts`;
}

/**
 * Check whether the 60db provider tab is enabled (frontend flag only).
 * The actual keys (SIXTYDB_API_KEY, ANTHROPIC_API_KEY) live on the backend.
 */
export function checkSixtyDbConfiguration(): boolean {
  const enabled = import.meta.env.VITE_SIXTYDB_ENABLED;
  return enabled === 'true' || enabled === true;
}
