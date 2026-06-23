/**
 * SixtyDbVoiceContext - Conversational voice agent built on 60db + Claude
 *
 * 60db provides TTS + STT only (no LLM), so this context orchestrates the full
 * loop client-side:
 *
 *   mic -> VAD (utterance segmentation) -> 60db STT (backend proxy)
 *       -> Claude (backend /chat) -> 60db streaming TTS (WS relay) -> playback
 *
 * Turn-taking is hands-free: an energy-based VAD ends the user's turn after a
 * sustained silence. Barge-in is supported - speaking over the assistant stops
 * playback immediately and starts a new turn.
 *
 * @see src/lib/sixtydb/audio-recorder.ts - mic capture + VAD segmentation
 * @see src/lib/sixtydb/tts-client.ts - 60db streaming TTS protocol
 * @see src/lib/sixtydb/audio-streamer.ts - PCM playback
 */

import {
  createContext,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { trackError } from '@/lib/errorTracking';
import { getApiBaseUrl } from '@/lib/apiConfig';
import { SixtyDbAudioRecorder } from '@/lib/sixtydb/audio-recorder';
import { SixtyDbAudioStreamer } from '@/lib/sixtydb/audio-streamer';
import { SixtyDbTTSClient } from '@/lib/sixtydb/tts-client';
import { DEFAULT_SIXTYDB_SYSTEM_PROMPT, DEFAULT_SIXTYDB_VOICE } from '@/lib/sixtydb/config';
import type {
  SixtyDbConnectionStatus,
  SixtyDbVoiceAction,
  SixtyDbVoiceContextValue,
  SixtyDbVoiceState,
} from '@/types/sixtydb';
import { SIXTYDB_INITIAL_STATE } from '@/types/sixtydb';
import type { VoiceMessage } from '@/types';

const DEBUG = import.meta.env.DEV;
const SIXTYDB_VOICE_KEY = 'sixtydb-voice';
const SIXTYDB_PROMPT_KEY = 'sixtydb-system-prompt';

function debugLog(context: string, message: string, data?: unknown) {
  if (DEBUG) {
    console.log(`[SixtyDbVoiceContext:${context}]`, message, data ?? '');
  }
}

// =============================================================================
// REDUCER
// =============================================================================

function sixtyDbReducer(state: SixtyDbVoiceState, action: SixtyDbVoiceAction): SixtyDbVoiceState {
  switch (action.type) {
    case 'SET_STATUS': {
      const status = action.payload;
      return {
        ...state,
        status,
        isConnected:
          status === 'connected' ||
          status === 'listening' ||
          status === 'thinking' ||
          status === 'speaking',
        isLoading: status === 'connecting' || status === 'disconnecting',
      };
    }
    case 'SET_SPEAKING':
      return { ...state, isSpeaking: action.payload };
    case 'SET_LISTENING':
      return { ...state, isListening: action.payload };
    case 'SET_THINKING':
      return { ...state, isThinking: action.payload };
    case 'SET_MUTED':
      return { ...state, isMuted: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, status: action.payload ? 'error' : state.status };
    case 'SET_VOLUME':
      return { ...state, volume: action.payload };
    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.payload] };
    case 'SET_ACTIVE_TRANSCRIPT':
      return { ...state, activeTranscript: action.payload };
    case 'RESET':
      return { ...SIXTYDB_INITIAL_STATE, volume: state.volume };
    default:
      return state;
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function parseMicrophoneError(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name;
    const message = error.message.toLowerCase();
    if (name === 'NotAllowedError' || message.includes('permission denied')) {
      return 'Microphone access denied. Please allow microphone permission.';
    }
    if (name === 'NotFoundError' || message.includes('not found')) {
      return 'No microphone found. Please connect a microphone.';
    }
    if (name === 'NotReadableError' || message.includes('not readable')) {
      return 'Microphone is in use by another application.';
    }
    if (name === 'SecurityError' || message.includes('secure context')) {
      return 'Microphone requires an HTTPS connection.';
    }
    return `Microphone error: ${error.message}`;
  }
  return 'Failed to access microphone.';
}

function parseAgentError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes('network') || message.includes('fetch')) {
      return 'Network error. Please check your internet connection.';
    }
    if (message.includes('websocket') || message.includes('socket')) {
      return 'Voice connection lost. Please try again.';
    }
    if (message.includes('401') || message.includes('unauthorized') || message.includes('api key')) {
      return 'Authentication failed. Check the 60db / Anthropic API keys on the server.';
    }
    if (message.includes('429') || message.includes('rate limit')) {
      return 'Rate limited. Please wait a moment and try again.';
    }
    if (message.includes('credit') || message.includes('quota') || message.includes('billing')) {
      return 'Account credits exhausted. Please top up your 60db / Anthropic balance.';
    }
    return error.message;
  }
  return 'An unexpected error occurred.';
}

function readLocalStorage(key: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function writeLocalStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

type ChatMessage = { role: 'user' | 'assistant'; content: string };

/** Send recorded audio to the backend STT proxy and return the transcript. */
async function transcribeUtterance(blob: Blob): Promise<string> {
  const response = await fetch(`${getApiBaseUrl()}/api/60db/stt?language=auto`, {
    method: 'POST',
    headers: { 'Content-Type': blob.type || 'audio/webm' },
    credentials: 'include',
    body: blob,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Transcription failed' }));
    throw new Error(error.message || `STT error: ${response.status}`);
  }
  const data = await response.json();
  return typeof data?.text === 'string' ? data.text.trim() : '';
}

/** Ask Claude (backend brain) for the assistant's reply to the conversation. */
async function generateReply(messages: ChatMessage[], system: string): Promise<string> {
  const response = await fetch(`${getApiBaseUrl()}/api/60db/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ messages, system }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to generate reply' }));
    throw new Error(error.message || `Chat error: ${response.status}`);
  }
  const data = await response.json();
  return typeof data?.text === 'string' ? data.text.trim() : '';
}

// =============================================================================
// CONTEXT
// =============================================================================

// eslint-disable-next-line react-refresh/only-export-components
export const SixtyDbVoiceContext = createContext<SixtyDbVoiceContextValue | null>(null);

interface SixtyDbVoiceProviderProps {
  children: ReactNode;
  onDisconnect?: () => void;
}

export function SixtyDbVoiceProvider({ children, onDisconnect }: SixtyDbVoiceProviderProps) {
  const [state, dispatch] = useReducer(sixtyDbReducer, SIXTYDB_INITIAL_STATE);

  // Voice + prompt selection (persisted)
  const [selectedVoice, setSelectedVoiceState] = useState(() =>
    readLocalStorage(SIXTYDB_VOICE_KEY, DEFAULT_SIXTYDB_VOICE)
  );
  const [systemPrompt, setSystemPromptState] = useState(() =>
    readLocalStorage(SIXTYDB_PROMPT_KEY, DEFAULT_SIXTYDB_SYSTEM_PROMPT)
  );

  // Infrastructure refs
  const recorderRef = useRef<SixtyDbAudioRecorder | null>(null);
  const streamerRef = useRef<SixtyDbAudioStreamer | null>(null);
  const ttsClientRef = useRef<SixtyDbTTSClient | null>(null);

  // Coordination refs (avoid stale closures inside event callbacks)
  const statusRef = useRef<SixtyDbConnectionStatus>(state.status);
  const processingRef = useRef(false);
  const acceptAudioRef = useRef(false);
  const mutedRef = useRef(false);
  const intentionalDisconnectRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const selectedVoiceRef = useRef(selectedVoice);
  const systemPromptRef = useRef(systemPrompt);

  useEffect(() => {
    statusRef.current = state.status;
  }, [state.status]);
  useEffect(() => {
    selectedVoiceRef.current = selectedVoice;
  }, [selectedVoice]);
  useEffect(() => {
    systemPromptRef.current = systemPrompt;
  }, [systemPrompt]);

  const setVoice = useCallback((voice: string) => {
    setSelectedVoiceState(voice);
    writeLocalStorage(SIXTYDB_VOICE_KEY, voice);
  }, []);

  const setSystemPrompt = useCallback((prompt: string) => {
    setSystemPromptState(prompt);
    writeLocalStorage(SIXTYDB_PROMPT_KEY, prompt);
  }, []);

  /** Return to the idle listening state after the assistant finishes speaking. */
  const finalizeSpeaking = useCallback(() => {
    acceptAudioRef.current = false;
    if (statusRef.current === 'speaking') {
      dispatch({ type: 'SET_SPEAKING', payload: false });
      dispatch({ type: 'SET_ACTIVE_TRANSCRIPT', payload: '' });
      dispatch({ type: 'SET_LISTENING', payload: true });
      dispatch({ type: 'SET_STATUS', payload: 'listening' });
    }
  }, []);

  /** Run one full turn: transcribe -> Claude -> speak. */
  const handleUtterance = useCallback(async (blob: Blob) => {
    // Only one pipeline at a time; overlapping utterances are dropped.
    if (processingRef.current || mutedRef.current) {
      debugLog('handleUtterance', 'Dropping utterance (busy or muted)');
      return;
    }
    processingRef.current = true;
    dispatch({ type: 'SET_LISTENING', payload: false });
    dispatch({ type: 'SET_THINKING', payload: true });
    dispatch({ type: 'SET_STATUS', payload: 'thinking' });

    try {
      const transcript = await transcribeUtterance(blob);
      if (!transcript) {
        debugLog('handleUtterance', 'Empty transcript, returning to listening');
        dispatch({ type: 'SET_THINKING', payload: false });
        dispatch({ type: 'SET_LISTENING', payload: true });
        dispatch({ type: 'SET_STATUS', payload: 'listening' });
        return;
      }

      debugLog('handleUtterance', 'User said', transcript);
      const userMessage: VoiceMessage = {
        id: `sixtydb-user-${Date.now()}`,
        role: 'user',
        content: transcript,
        timestamp: Date.now(),
      };
      dispatch({ type: 'ADD_MESSAGE', payload: userMessage });
      messagesRef.current.push({ role: 'user', content: transcript });

      const reply = await generateReply(messagesRef.current, systemPromptRef.current);
      if (!reply) {
        throw new Error('Empty reply from assistant');
      }

      debugLog('handleUtterance', 'Assistant reply', reply);
      const assistantMessage: VoiceMessage = {
        id: `sixtydb-assistant-${Date.now()}`,
        role: 'assistant',
        content: reply,
        timestamp: Date.now(),
      };
      dispatch({ type: 'ADD_MESSAGE', payload: assistantMessage });
      messagesRef.current.push({ role: 'assistant', content: reply });

      // Speak the reply via streaming TTS.
      acceptAudioRef.current = true;
      dispatch({ type: 'SET_THINKING', payload: false });
      dispatch({ type: 'SET_SPEAKING', payload: true });
      dispatch({ type: 'SET_ACTIVE_TRANSCRIPT', payload: reply });
      dispatch({ type: 'SET_STATUS', payload: 'speaking' });
      ttsClientRef.current?.speak(reply);
    } catch (error) {
      const message = parseAgentError(error);
      trackError('SixtyDbVoiceContext', 'Turn pipeline failed', error);
      dispatch({ type: 'SET_ERROR', payload: message });
      // Recover to listening so the conversation can continue.
      dispatch({ type: 'SET_THINKING', payload: false });
      dispatch({ type: 'SET_SPEAKING', payload: false });
      if (statusRef.current !== 'idle') {
        dispatch({ type: 'SET_LISTENING', payload: true });
        dispatch({ type: 'SET_STATUS', payload: 'listening' });
      }
    } finally {
      processingRef.current = false;
    }
  }, []);

  /** VAD detected speech onset: barge-in over the assistant if it is speaking. */
  const handleSpeechStart = useCallback(() => {
    if (statusRef.current === 'speaking') {
      debugLog('handleSpeechStart', 'Barge-in detected, stopping playback');
      acceptAudioRef.current = false;
      streamerRef.current?.stop();
      dispatch({ type: 'SET_SPEAKING', payload: false });
      dispatch({ type: 'SET_ACTIVE_TRANSCRIPT', payload: '' });
      dispatch({ type: 'SET_LISTENING', payload: true });
      dispatch({ type: 'SET_STATUS', payload: 'listening' });
    } else if (statusRef.current === 'connected' || statusRef.current === 'listening') {
      dispatch({ type: 'SET_LISTENING', payload: true });
      dispatch({ type: 'SET_STATUS', payload: 'listening' });
    }
    // While 'thinking', ignore onset so the in-flight pipeline completes.
  }, []);

  const connect = useCallback(async () => {
    if (statusRef.current === 'connecting' || state.isConnected) {
      debugLog('connect', 'Already connecting or connected');
      return;
    }

    const voiceId = selectedVoiceRef.current?.trim();
    if (!voiceId) {
      dispatch({
        type: 'SET_ERROR',
        payload: 'No 60db voice configured. Set VITE_SIXTYDB_VOICE or pick a voice.',
      });
      return;
    }

    intentionalDisconnectRef.current = false;
    processingRef.current = false;
    acceptAudioRef.current = false;
    messagesRef.current = [];
    dispatch({ type: 'SET_ERROR', payload: null });
    dispatch({ type: 'SET_STATUS', payload: 'connecting' });

    // 1. Audio playback
    const streamer = new SixtyDbAudioStreamer({ initialVolume: state.volume });
    streamerRef.current = streamer;
    streamer.start();
    streamer.on('ended', finalizeSpeaking);

    // 2. Streaming TTS over the relay
    const tts = new SixtyDbTTSClient({ voiceId });
    ttsClientRef.current = tts;
    tts.on('audio', (base64) => {
      if (acceptAudioRef.current) {
        streamer.addPCM(base64);
      }
    });
    tts.on('flushed', () => {
      if (!streamer.playing) finalizeSpeaking();
    });
    tts.on('error', (error) => {
      trackError('SixtyDbVoiceContext', 'TTS error', error);
      dispatch({ type: 'SET_ERROR', payload: parseAgentError(error) });
    });

    try {
      await tts.connect();
    } catch (error) {
      trackError('SixtyDbVoiceContext', 'TTS connect failed', error);
      dispatch({ type: 'SET_ERROR', payload: parseAgentError(error) });
      streamer.cleanup();
      tts.close();
      streamerRef.current = null;
      ttsClientRef.current = null;
      return;
    }

    // 3. Microphone capture + VAD segmentation
    const recorder = new SixtyDbAudioRecorder();
    recorderRef.current = recorder;
    recorder.on('speechstart', handleSpeechStart);
    recorder.on('speechend', () => {
      if (statusRef.current === 'listening') {
        dispatch({ type: 'SET_LISTENING', payload: false });
        dispatch({ type: 'SET_THINKING', payload: true });
        dispatch({ type: 'SET_STATUS', payload: 'thinking' });
      }
    });
    recorder.on('utterance', (audio) => {
      void handleUtterance(audio);
    });
    recorder.on('error', (error) => {
      trackError('SixtyDbVoiceContext', 'Recorder error', error);
      dispatch({ type: 'SET_ERROR', payload: parseMicrophoneError(error) });
    });

    try {
      await recorder.start();
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: parseMicrophoneError(error) });
      recorder.stop();
      tts.close();
      streamer.cleanup();
      recorderRef.current = null;
      ttsClientRef.current = null;
      streamerRef.current = null;
      return;
    }

    dispatch({ type: 'SET_LISTENING', payload: true });
    dispatch({ type: 'SET_STATUS', payload: 'listening' });
    debugLog('connect', 'Connected and listening');
  }, [state.isConnected, state.volume, finalizeSpeaking, handleSpeechStart, handleUtterance]);

  const disconnect = useCallback(async () => {
    debugLog('disconnect', 'Disconnecting...');
    intentionalDisconnectRef.current = true;
    dispatch({ type: 'SET_STATUS', payload: 'disconnecting' });

    if (recorderRef.current) {
      recorderRef.current.stop();
      recorderRef.current = null;
    }
    if (ttsClientRef.current) {
      ttsClientRef.current.close();
      ttsClientRef.current = null;
    }
    if (streamerRef.current) {
      streamerRef.current.cleanup();
      streamerRef.current = null;
    }

    processingRef.current = false;
    acceptAudioRef.current = false;
    messagesRef.current = [];

    dispatch({ type: 'RESET' });
    onDisconnect?.();
    debugLog('disconnect', 'Disconnected');
  }, [onDisconnect]);

  const toggleMute = useCallback(() => {
    const newMuted = !mutedRef.current;
    mutedRef.current = newMuted;
    recorderRef.current?.setMuted(newMuted);
    dispatch({ type: 'SET_MUTED', payload: newMuted });
  }, []);

  const setVolume = useCallback((volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume));
    dispatch({ type: 'SET_VOLUME', payload: clamped });
    streamerRef.current?.setVolume(clamped);
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: null });
  }, []);

  const getOutputAnalyser = useCallback(() => streamerRef.current?.getAnalyser() ?? null, []);
  const getInputAnalyser = useCallback(() => recorderRef.current?.getAnalyser() ?? null, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recorderRef.current?.stop();
      ttsClientRef.current?.close();
      streamerRef.current?.cleanup();
    };
  }, []);

  const value: SixtyDbVoiceContextValue = {
    ...state,
    selectedVoice,
    setVoice,
    systemPrompt,
    setSystemPrompt,
    connect,
    disconnect,
    toggleMute,
    setVolume,
    clearError,
    getOutputAnalyser,
    getInputAnalyser,
  };

  return <SixtyDbVoiceContext.Provider value={value}>{children}</SixtyDbVoiceContext.Provider>;
}

export default SixtyDbVoiceContext;
