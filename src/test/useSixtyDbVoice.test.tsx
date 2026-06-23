/**
 * useSixtyDbVoice Hook Tests
 *
 * Unit tests for the 60db voice hook and orchestrator context:
 * - Hook guards (must be used within provider)
 * - Initial state
 * - Voice selection persistence
 * - Connect guard when no voice is configured
 * - Happy-path connect reaching the listening state
 *
 * @see src/hooks/useSixtyDbVoice.ts
 * @see src/contexts/SixtyDbVoiceContext.tsx
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { type ReactNode } from 'react';
import { SixtyDbVoiceProvider } from '@/contexts/SixtyDbVoiceContext';
import { useSixtyDbVoice } from '@/hooks/useSixtyDbVoice';
import { SIXTYDB_INITIAL_STATE } from '@/types/sixtydb';

// Mock the audio recorder (mic + VAD)
const recorderHandlers: Record<string, (...args: unknown[]) => void> = {};
vi.mock('@/lib/sixtydb/audio-recorder', () => ({
  SixtyDbAudioRecorder: class {
    on = vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      recorderHandlers[event] = cb;
    });
    start = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn();
    setMuted = vi.fn();
    getAnalyser = vi.fn().mockReturnValue(null);
  },
}));

// Mock the audio streamer (playback)
vi.mock('@/lib/sixtydb/audio-streamer', () => ({
  SixtyDbAudioStreamer: class {
    playing = false;
    on = vi.fn();
    start = vi.fn();
    addPCM = vi.fn();
    setVolume = vi.fn();
    stop = vi.fn();
    cleanup = vi.fn();
    getAnalyser = vi.fn().mockReturnValue(null);
  },
}));

// Mock the streaming TTS client
vi.mock('@/lib/sixtydb/tts-client', () => ({
  SixtyDbTTSClient: class {
    isReady = true;
    on = vi.fn();
    connect = vi.fn().mockResolvedValue(undefined);
    speak = vi.fn();
    close = vi.fn();
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  return <SixtyDbVoiceProvider>{children}</SixtyDbVoiceProvider>;
}

beforeEach(() => {
  localStorage.clear();
  for (const key of Object.keys(recorderHandlers)) delete recorderHandlers[key];
});

describe('useSixtyDbVoice', () => {
  it('throws when used outside a provider', () => {
    expect(() => renderHook(() => useSixtyDbVoice())).toThrow(
      /must be used within a SixtyDbVoiceProvider/
    );
  });

  it('starts in the idle initial state', () => {
    const { result } = renderHook(() => useSixtyDbVoice(), { wrapper });
    expect(result.current.status).toBe('idle');
    expect(result.current.isConnected).toBe(false);
    expect(result.current.messages).toEqual(SIXTYDB_INITIAL_STATE.messages);
  });

  it('persists the selected voice to localStorage', () => {
    const { result } = renderHook(() => useSixtyDbVoice(), { wrapper });
    act(() => result.current.setVoice('voice-abc'));
    expect(result.current.selectedVoice).toBe('voice-abc');
    expect(localStorage.getItem('sixtydb-voice')).toBe('voice-abc');
  });

  it('refuses to connect without a configured voice', async () => {
    const { result } = renderHook(() => useSixtyDbVoice(), { wrapper });
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/voice/i);
  });

  it('connects and reaches the listening state when a voice is set', async () => {
    const { result } = renderHook(() => useSixtyDbVoice(), { wrapper });
    act(() => result.current.setVoice('voice-abc'));
    await act(async () => {
      await result.current.connect();
    });
    expect(result.current.status).toBe('listening');
    expect(result.current.isConnected).toBe(true);
    expect(result.current.isListening).toBe(true);
  });
});
