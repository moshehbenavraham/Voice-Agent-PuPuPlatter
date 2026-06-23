/**
 * Audio utilities for 60db streaming TTS.
 *
 * 60db delivers TTS audio as base64-encoded LINEAR16 (16-bit signed PCM,
 * little-endian, mono) in the `audioContent` field of each `audio_chunk`.
 * These helpers decode that payload for Web Audio playback.
 */

/**
 * Decode a base64 LINEAR16 (PCM16 little-endian) chunk to Float32 samples in
 * the range [-1.0, 1.0].
 */
export function base64PCM16ToFloat32(base64Audio: string): Float32Array {
  if (!base64Audio || base64Audio.length === 0) {
    return new Float32Array(0);
  }

  const binary = atob(base64Audio);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleCount = Math.floor(bytes.length / 2);
  const float32 = new Float32Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const int16 = view.getInt16(i * 2, true);
    float32[i] = int16 / 0x8000;
  }

  return float32;
}

/**
 * Compute the RMS (root-mean-square) energy of a frame of Float32 time-domain
 * samples. Used by the VAD to detect speech vs silence.
 */
export function computeRms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}
