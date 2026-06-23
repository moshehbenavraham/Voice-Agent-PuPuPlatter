/**
 * 60db Audio Recorder
 *
 * Captures the microphone and segments it into discrete utterances using the
 * energy-based VAD. Each completed utterance is emitted as an audio Blob, which
 * the context uploads to 60db STT.
 *
 * Flow:
 *   getUserMedia -> AudioContext analyser -> VAD
 *   VAD onSpeechStart -> start a fresh MediaRecorder
 *   VAD onSpeechEnd   -> stop it, assemble Blob, emit 'utterance'
 */

import EventEmitter from 'eventemitter3';
import { VoiceActivityDetector } from './vad';

export interface SixtyDbAudioRecorderEvents {
  /** A complete spoken utterance, ready for transcription. */
  utterance: (audio: Blob) => void;
  speechstart: () => void;
  speechend: () => void;
  started: () => void;
  stopped: () => void;
  error: (error: Error) => void;
}

/** Pick the best-supported audio MIME type for MediaRecorder. */
function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
    for (const type of candidates) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
  }
  return '';
}

export class SixtyDbAudioRecorder extends EventEmitter<SixtyDbAudioRecorderEvents> {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private vad: VoiceActivityDetector | null = null;

  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private readonly mimeType: string;

  private isRecording = false;
  private muted = false;

  constructor() {
    super();
    this.mimeType = pickMimeType();
  }

  async start(): Promise<void> {
    if (this.isRecording) return;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      this.audioContext = new AudioContext();
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 1024;
      this.sourceNode.connect(this.analyserNode);

      this.vad = new VoiceActivityDetector(this.analyserNode);
      this.vad.start({
        onSpeechStart: () => this.handleSpeechStart(),
        onSpeechEnd: () => this.handleSpeechEnd(),
      });

      this.isRecording = true;
      this.emit('started');
    } catch (error) {
      this.cleanup();
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('error', err);
      throw err;
    }
  }

  /** Get the input AnalyserNode for visualization. */
  getAnalyser(): AnalyserNode | null {
    return this.analyserNode;
  }

  /** When muted, utterances are still segmented but not emitted. */
  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  private handleSpeechStart(): void {
    this.emit('speechstart');
    if (!this.mediaStream) return;

    try {
      this.chunks = [];
      this.mediaRecorder = this.mimeType
        ? new MediaRecorder(this.mediaStream, { mimeType: this.mimeType })
        : new MediaRecorder(this.mediaStream);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const type = this.mimeType || this.chunks[0]?.type || 'audio/webm';
        const blob = new Blob(this.chunks, { type });
        this.chunks = [];
        this.emit('speechend');
        if (!this.muted && blob.size > 0) {
          this.emit('utterance', blob);
        }
      };

      this.mediaRecorder.start();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('error', err);
    }
  }

  private handleSpeechEnd(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    } else {
      this.emit('speechend');
    }
  }

  stop(): void {
    if (!this.isRecording) return;
    this.cleanup();
    this.isRecording = false;
    this.emit('stopped');
  }

  private cleanup(): void {
    if (this.vad) {
      this.vad.stop();
      this.vad = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        /* ignore */
      }
    }
    this.mediaRecorder = null;
    this.chunks = [];

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    this.analyserNode = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {
        /* ignore */
      });
    }
    this.audioContext = null;
  }
}
