/**
 * 60db Streaming TTS Client
 *
 * Speaks the native 60db WebSocket TTS protocol over the backend relay
 * (/api/60db/tts), so the API key never reaches the browser.
 *
 * Lifecycle:
 *   connect() -> wait for connection_established -> create_context -> context_created
 *   speak(text) -> send_text + flush_context -> audio_chunk* -> flush_completed
 *   close() -> close_context
 *
 * @see https://docs.60db.ai/websocket-api/tts
 */

import EventEmitter from 'eventemitter3';
import {
  SIXTYDB_AUDIO_ENCODING,
  SIXTYDB_DEFAULTS,
  SIXTYDB_OUTPUT_SAMPLE_RATE,
  buildSixtyDbTtsWsUrl,
} from './config';

export interface SixtyDbTTSClientOptions {
  voiceId: string;
  speed?: number;
  stability?: number;
  similarity?: number;
  sampleRate?: number;
}

export interface SixtyDbTTSClientEvents {
  /** A base64 LINEAR16 audio chunk for the current synthesis. */
  audio: (base64: string) => void;
  /** All audio for a flushed segment has been delivered. */
  flushed: () => void;
  ready: () => void;
  error: (error: Error) => void;
  close: () => void;
}

const CONNECT_TIMEOUT_MS = 12000;

let contextCounter = 0;

export class SixtyDbTTSClient extends EventEmitter<SixtyDbTTSClientEvents> {
  private ws: WebSocket | null = null;
  private readonly options: Required<SixtyDbTTSClientOptions>;
  private readonly contextId: string;
  private ready = false;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: SixtyDbTTSClientOptions) {
    super();
    this.options = {
      voiceId: options.voiceId,
      speed: options.speed ?? SIXTYDB_DEFAULTS.speed,
      stability: options.stability ?? SIXTYDB_DEFAULTS.stability,
      similarity: options.similarity ?? SIXTYDB_DEFAULTS.similarity,
      sampleRate: options.sampleRate ?? SIXTYDB_OUTPUT_SAMPLE_RATE,
    };
    contextCounter += 1;
    this.contextId = `ctx-${Date.now()}-${contextCounter}`;
  }

  get isReady(): boolean {
    return this.ready;
  }

  /** Open the relay socket and initialize a synthesis context. */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        if (this.connectTimer) clearTimeout(this.connectTimer);
        reject(new Error(message));
      };

      this.connectTimer = setTimeout(() => fail('Timed out connecting to 60db TTS'), CONNECT_TIMEOUT_MS);

      try {
        this.ws = new WebSocket(buildSixtyDbTtsWsUrl());
      } catch (error) {
        fail(error instanceof Error ? error.message : 'Failed to open 60db TTS socket');
        return;
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data, () => {
          if (settled) return;
          settled = true;
          if (this.connectTimer) clearTimeout(this.connectTimer);
          resolve();
        });
      };

      this.ws.onerror = () => {
        this.emit('error', new Error('60db TTS connection error'));
        fail('60db TTS connection error');
      };

      this.ws.onclose = () => {
        this.ready = false;
        this.emit('close');
        fail('60db TTS connection closed');
      };
    });
  }

  private handleMessage(raw: unknown, onReady: () => void): void {
    if (typeof raw !== 'string') return;

    let message: Record<string, unknown>;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    // Server handshake -> initialize the synthesis context.
    if ('connection_established' in message) {
      this.sendCreateContext();
      return;
    }

    if ('context_created' in message) {
      this.ready = true;
      this.emit('ready');
      onReady();
      return;
    }

    if ('audio_chunk' in message) {
      const chunk = message.audio_chunk as { audioContent?: string };
      if (chunk?.audioContent) {
        this.emit('audio', chunk.audioContent);
      }
      return;
    }

    if ('flush_completed' in message) {
      this.emit('flushed');
      return;
    }

    if ('error' in message) {
      const err = message.error as { message?: string };
      this.emit('error', new Error(err?.message || '60db TTS error'));
      return;
    }

    // context_closed and connecting acks are ignored.
  }

  private sendCreateContext(): void {
    this.send({
      create_context: {
        context_id: this.contextId,
        voice_id: this.options.voiceId,
        audio_config: {
          audio_encoding: SIXTYDB_AUDIO_ENCODING,
          sample_rate_hertz: this.options.sampleRate,
        },
        speed: this.options.speed,
        stability: this.options.stability,
        similarity: this.options.similarity,
      },
    });
  }

  /** Synthesize and stream a full reply. */
  speak(text: string): void {
    const trimmed = text.trim();
    if (!trimmed || !this.ready) return;
    this.send({ send_text: { context_id: this.contextId, text: trimmed } });
    this.send({ flush_context: { context_id: this.contextId } });
  }

  private send(payload: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  /** Close the synthesis context and the socket. */
  close(): void {
    this.ready = false;
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    if (this.ws) {
      try {
        if (this.ws.readyState === WebSocket.OPEN) {
          this.send({ close_context: { context_id: this.contextId } });
        }
        this.ws.onmessage = null;
        this.ws.onerror = null;
        this.ws.onclose = null;
        this.ws.close();
      } catch {
        /* ignore */
      }
      this.ws = null;
    }
  }
}
