/**
 * 60db Audio Streamer
 *
 * Plays back base64 LINEAR16 (PCM16) audio chunks streamed from 60db TTS over
 * the WebSocket relay. Uses AudioBufferSourceNode scheduling for gapless
 * playback and exposes an AnalyserNode for output visualization.
 */

import EventEmitter from 'eventemitter3';
import { base64PCM16ToFloat32 } from './audioUtils';
import { SIXTYDB_OUTPUT_SAMPLE_RATE } from './config';

export interface SixtyDbAudioStreamerEvents {
  started: () => void;
  stopped: () => void;
  playing: () => void;
  ended: () => void;
  error: (error: Error) => void;
}

interface QueuedAudio {
  source: AudioBufferSourceNode;
}

export class SixtyDbAudioStreamer extends EventEmitter<SixtyDbAudioStreamerEvents> {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private readonly sampleRate: number;
  private isPlaying = false;
  private queue: QueuedAudio[] = [];
  private nextStartTime = 0;
  private currentVolume: number;

  constructor(config: { sampleRate?: number; initialVolume?: number } = {}) {
    super();
    this.sampleRate = config.sampleRate ?? SIXTYDB_OUTPUT_SAMPLE_RATE;
    this.currentVolume = config.initialVolume ?? 1.0;
  }

  start(): void {
    if (this.audioContext) return;

    this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
    this.gainNode = this.audioContext.createGain();
    this.gainNode.gain.setValueAtTime(this.currentVolume, this.audioContext.currentTime);

    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 256;

    // gain -> analyser -> destination
    this.gainNode.connect(this.analyserNode);
    this.analyserNode.connect(this.audioContext.destination);

    this.nextStartTime = this.audioContext.currentTime;
    this.queue = [];
    this.emit('started');
  }

  /** Append a base64 LINEAR16 chunk to the gapless playback schedule. */
  addPCM(base64Audio: string): void {
    if (!this.audioContext || !this.gainNode) {
      throw new Error('Audio streamer not started. Call start() first.');
    }

    const float32 = base64PCM16ToFloat32(base64Audio);
    if (float32.length === 0) return;

    const buffer = this.audioContext.createBuffer(1, float32.length, this.sampleRate);
    buffer.copyToChannel(float32, 0);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);

    const startTime = Math.max(this.nextStartTime, this.audioContext.currentTime);
    source.start(startTime);
    this.nextStartTime = startTime + buffer.duration;

    const queued: QueuedAudio = { source };
    this.queue.push(queued);

    if (!this.isPlaying) {
      this.isPlaying = true;
      this.emit('playing');
    }

    source.onended = () => {
      const index = this.queue.indexOf(queued);
      if (index > -1) this.queue.splice(index, 1);
      if (this.queue.length === 0 && this.isPlaying) {
        this.isPlaying = false;
        this.emit('ended');
      }
    };
  }

  setVolume(volume: number): void {
    this.currentVolume = Math.max(0, Math.min(1, volume));
    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.setValueAtTime(this.currentVolume, this.audioContext.currentTime);
    }
  }

  get volume(): number {
    return this.currentVolume;
  }

  get playing(): boolean {
    return this.isPlaying;
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  /** Stop and flush all scheduled audio immediately (used for barge-in). */
  stop(): void {
    for (const item of this.queue) {
      try {
        item.source.onended = null;
        item.source.stop();
        item.source.disconnect();
      } catch {
        /* already stopped */
      }
    }
    this.queue = [];
    if (this.audioContext) {
      this.nextStartTime = this.audioContext.currentTime;
    }
    if (this.isPlaying) {
      this.isPlaying = false;
      this.emit('ended');
    }
  }

  cleanup(): void {
    this.stop();
    if (this.gainNode) {
      this.gainNode.disconnect();
      this.gainNode = null;
    }
    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {
        /* ignore */
      });
    }
    this.audioContext = null;
    this.emit('stopped');
  }
}
