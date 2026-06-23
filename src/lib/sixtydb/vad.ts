/**
 * Energy-based Voice Activity Detector
 *
 * 60db STT is batch (it transcribes a complete utterance), so we segment the
 * live mic stream client-side. This detector watches an AnalyserNode's
 * time-domain signal and fires:
 *   - onSpeechStart once sustained speech is detected
 *   - onSpeechEnd   once a sustained silence follows speech (turn complete)
 *
 * It is intentionally simple (RMS threshold + timers). Thresholds are tunable
 * via SIXTYDB_VAD_CONFIG.
 */

import { computeRms } from './audioUtils';
import { SIXTYDB_VAD_CONFIG } from './config';

export interface VadCallbacks {
  onSpeechStart: () => void;
  onSpeechEnd: () => void;
}

export interface VadConfig {
  speechThreshold: number;
  minSpeechMs: number;
  silenceMs: number;
  maxUtteranceMs: number;
}

export class VoiceActivityDetector {
  private readonly analyser: AnalyserNode;
  private readonly config: VadConfig;
  private readonly buffer: Float32Array;

  private rafId: number | null = null;
  private running = false;
  private callbacks: VadCallbacks | null = null;

  private isSpeaking = false;
  private speechAccumMs = 0;
  private silenceAccumMs = 0;
  private utteranceMs = 0;
  private lastTime = 0;

  constructor(analyser: AnalyserNode, config: Partial<VadConfig> = {}) {
    this.analyser = analyser;
    this.config = {
      speechThreshold: config.speechThreshold ?? SIXTYDB_VAD_CONFIG.speechThreshold,
      minSpeechMs: config.minSpeechMs ?? SIXTYDB_VAD_CONFIG.minSpeechMs,
      silenceMs: config.silenceMs ?? SIXTYDB_VAD_CONFIG.silenceMs,
      maxUtteranceMs: config.maxUtteranceMs ?? SIXTYDB_VAD_CONFIG.maxUtteranceMs,
    };
    this.buffer = new Float32Array(analyser.fftSize);
  }

  start(callbacks: VadCallbacks): void {
    if (this.running) return;
    this.callbacks = callbacks;
    this.running = true;
    this.reset();
    this.lastTime = performance.now();
    this.loop();
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    // If we stop mid-utterance, treat it as ended so callers can clean up.
    if (this.isSpeaking) {
      this.isSpeaking = false;
    }
    this.callbacks = null;
  }

  private reset(): void {
    this.isSpeaking = false;
    this.speechAccumMs = 0;
    this.silenceAccumMs = 0;
    this.utteranceMs = 0;
  }

  private loop = (): void => {
    if (!this.running) return;

    const now = performance.now();
    const dt = now - this.lastTime;
    this.lastTime = now;

    this.analyser.getFloatTimeDomainData(this.buffer);
    const rms = computeRms(this.buffer);
    const isLoud = rms >= this.config.speechThreshold;

    if (!this.isSpeaking) {
      if (isLoud) {
        this.speechAccumMs += dt;
        if (this.speechAccumMs >= this.config.minSpeechMs) {
          this.isSpeaking = true;
          this.silenceAccumMs = 0;
          this.utteranceMs = 0;
          this.callbacks?.onSpeechStart();
        }
      } else {
        this.speechAccumMs = 0;
      }
    } else {
      this.utteranceMs += dt;
      if (isLoud) {
        this.silenceAccumMs = 0;
      } else {
        this.silenceAccumMs += dt;
      }

      const silenceReached = this.silenceAccumMs >= this.config.silenceMs;
      const maxReached = this.utteranceMs >= this.config.maxUtteranceMs;
      if (silenceReached || maxReached) {
        this.isSpeaking = false;
        this.speechAccumMs = 0;
        this.callbacks?.onSpeechEnd();
      }
    }

    this.rafId = requestAnimationFrame(this.loop);
  };
}
