import express, { Router } from 'express';
import { sanitizeLogInput } from '../utils/sanitize.js';
import { mapProviderError, validateString } from '../utils/security.js';

const router = Router();

// 60db API configuration constants
const SIXTYDB_API_BASE = process.env.SIXTYDB_API_BASE || 'https://api.60db.ai';
const SIXTYDB_STT_URL = `${SIXTYDB_API_BASE}/stt`;
const SIXTYDB_VOICES_URL = `${SIXTYDB_API_BASE}/myvoices`;
const REQUEST_TIMEOUT_MS = 30000;

// Anthropic (Claude) configuration - 60db has no LLM, Claude is the "brain"
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
// Voice agents are latency sensitive, so default to the fast Haiku tier.
const DEFAULT_CHAT_MODEL = process.env.SIXTYDB_CHAT_MODEL || 'claude-haiku-4-5-20251001';
const MAX_OUTPUT_TOKENS = 512;
const MAX_MESSAGES = 60;
const MAX_MESSAGE_CHARS = 8000;

const DEFAULT_SYSTEM_PROMPT =
  'You are a friendly, helpful voice assistant. Keep responses brief, natural, and ' +
  'conversational since they are spoken aloud. Avoid markdown, lists, and code blocks.';

/**
 * Validates that SIXTYDB_API_KEY is configured.
 * @returns {{ valid: boolean, apiKey?: string, error?: { error: string, message: string } }}
 */
function validateSixtyDbKey() {
  const apiKey = process.env.SIXTYDB_API_KEY;
  if (!apiKey) {
    console.error('[Server] SIXTYDB_API_KEY is not configured');
    return {
      valid: false,
      error: { error: 'Server configuration error', message: '60db API key not configured' },
    };
  }
  return { valid: true, apiKey };
}

/**
 * Validates that ANTHROPIC_API_KEY is configured.
 * @returns {{ valid: boolean, apiKey?: string, error?: { error: string, message: string } }}
 */
function validateAnthropicKey() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('[Server] ANTHROPIC_API_KEY is not configured');
    return {
      valid: false,
      error: { error: 'Server configuration error', message: 'Anthropic API key not configured' },
    };
  }
  return { valid: true, apiKey };
}

/**
 * Maps an audio MIME type to a sensible upload filename for the STT multipart field.
 */
function filenameForMime(mime) {
  if (typeof mime !== 'string') return 'audio.webm';
  if (mime.includes('webm')) return 'audio.webm';
  if (mime.includes('ogg')) return 'audio.ogg';
  if (mime.includes('wav')) return 'audio.wav';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'audio.mp4';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'audio.mp3';
  return 'audio.webm';
}

/**
 * GET /api/60db/health
 * Reports whether both the 60db key and the Claude brain key are configured.
 */
router.get('/health', (req, res) => {
  const sixtyConfigured = Boolean(process.env.SIXTYDB_API_KEY);
  const claudeConfigured = Boolean(process.env.ANTHROPIC_API_KEY);
  res.json({
    configured: sixtyConfigured && claudeConfigured,
    provider: 'sixtydb',
    details: { sixtydb: sixtyConfigured, claude: claudeConfigured },
  });
});

/**
 * POST /api/60db/stt
 * Speech-to-text proxy. The browser sends raw recorded audio bytes (Content-Type
 * audio/webm etc.); the server forwards them to 60db /stt as multipart/form-data
 * so the SIXTYDB_API_KEY never reaches the client.
 *
 * Query params (optional): language (ISO 639-1 or "auto").
 * Response: 60db STT JSON ({ text, language, segments, ... }).
 */
router.post(
  '/stt',
  express.raw({ type: '*/*', limit: '12mb' }),
  async (req, res) => {
    const keyValidation = validateSixtyDbKey();
    if (!keyValidation.valid) {
      return res.status(500).json(keyValidation.error);
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Request body must contain audio bytes',
      });
    }

    const language = validateString(req.query.language, {
      field: 'language',
      maxLength: 32,
      pattern: /^[A-Za-z,_-]+$/,
      defaultValue: 'auto',
    });
    if (!language.valid) {
      return res.status(400).json(language.error);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const contentType = req.headers['content-type'] || 'audio/webm';
      const form = new FormData();
      form.append('file', new Blob([req.body], { type: contentType }), filenameForMime(contentType));
      if (language.value && language.value !== '') {
        form.append('language', language.value);
      }

      const response = await fetch(SIXTYDB_STT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${keyValidation.apiKey}` },
        body: form,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.error(`[Server] 60db STT error: ${response.status}`);
        return res.status(response.status).json(mapProviderError('60db', response.status));
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.error('[Server] 60db STT request timed out');
        return res
          .status(504)
          .json({ error: 'Request timeout', message: '60db STT request timed out' });
      }
      console.error('[Server] Error calling 60db STT:', error.message);
      res
        .status(500)
        .json({ error: 'Internal server error', message: 'Failed to transcribe audio' });
    }
  }
);

/**
 * Validates the /chat request body.
 * @returns {{ valid: boolean, messages?: Array, system?: string, error?: object }}
 */
function validateChatBody(body) {
  const requestBody = body || {};

  if (!Array.isArray(requestBody.messages) || requestBody.messages.length === 0) {
    return {
      valid: false,
      error: { error: 'Validation error', message: 'messages must be a non-empty array' },
    };
  }
  if (requestBody.messages.length > MAX_MESSAGES) {
    return {
      valid: false,
      error: { error: 'Validation error', message: `messages must contain at most ${MAX_MESSAGES} items` },
    };
  }

  const messages = [];
  for (const message of requestBody.messages) {
    const role = message?.role;
    const content = message?.content;
    if (role !== 'user' && role !== 'assistant') {
      return {
        valid: false,
        error: { error: 'Validation error', message: 'each message role must be user or assistant' },
      };
    }
    if (typeof content !== 'string' || content.trim().length === 0) {
      return {
        valid: false,
        error: { error: 'Validation error', message: 'each message content must be a non-empty string' },
      };
    }
    messages.push({ role, content: content.slice(0, MAX_MESSAGE_CHARS) });
  }

  const system = validateString(requestBody.system, {
    field: 'system',
    maxLength: 4000,
    defaultValue: DEFAULT_SYSTEM_PROMPT,
  });
  if (!system.valid) {
    return { valid: false, error: system.error };
  }

  return { valid: true, messages, system: system.value || DEFAULT_SYSTEM_PROMPT };
}

/**
 * POST /api/60db/chat
 * The conversational "brain". Forwards the transcript to Claude and returns the
 * assistant's reply text, which the frontend then speaks via 60db TTS.
 *
 * Request body: { messages: Array<{ role, content }>, system?: string }
 * Response: { text: string }
 */
router.post('/chat', async (req, res) => {
  const keyValidation = validateAnthropicKey();
  if (!keyValidation.valid) {
    return res.status(500).json(keyValidation.error);
  }

  const bodyValidation = validateChatBody(req.body);
  if (!bodyValidation.valid) {
    return res.status(400).json(bodyValidation.error);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': keyValidation.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: DEFAULT_CHAT_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: bodyValidation.system,
        messages: bodyValidation.messages,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(
        `[Server] Claude API error: ${response.status} ${sanitizeLogInput(detail).slice(0, 200)}`
      );
      return res.status(response.status).json(mapProviderError('Claude', response.status));
    }

    const data = await response.json();
    const text = Array.isArray(data?.content)
      ? data.content
          .filter((block) => block?.type === 'text' && typeof block.text === 'string')
          .map((block) => block.text)
          .join('')
          .trim()
      : '';

    if (!text) {
      return res
        .status(502)
        .json({ error: 'Claude API error', message: 'Empty response from Claude' });
    }

    res.json({ text });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.error('[Server] Claude request timed out');
      return res
        .status(504)
        .json({ error: 'Request timeout', message: 'Claude request timed out' });
    }
    console.error('[Server] Error calling Claude:', error.message);
    res.status(500).json({ error: 'Internal server error', message: 'Failed to generate reply' });
  }
});

/**
 * GET /api/60db/voices
 * Proxies the user's 60db voice catalog (/myvoices).
 * Response: 60db voices JSON ({ success, data: [...] }).
 */
router.get('/voices', async (req, res) => {
  const keyValidation = validateSixtyDbKey();
  if (!keyValidation.valid) {
    return res.status(500).json(keyValidation.error);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(SIXTYDB_VOICES_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${keyValidation.apiKey}` },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`[Server] 60db voices error: ${response.status}`);
      return res.status(response.status).json(mapProviderError('60db', response.status));
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      return res
        .status(504)
        .json({ error: 'Request timeout', message: '60db voices request timed out' });
    }
    console.error('[Server] Error calling 60db voices:', error.message);
    res.status(500).json({ error: 'Internal server error', message: 'Failed to fetch voices' });
  }
});

export default router;
export { validateChatBody, DEFAULT_CHAT_MODEL, DEFAULT_SYSTEM_PROMPT };
