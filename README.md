# Voice-Agent-PuPuPlatter

Multi-provider voice AI demo platform with React, TypeScript, Express, and a feature-flagged OpenAI live translation tab.

## Quick Start

```bash
npm run dev:all
```

This starts the Vite frontend on `http://localhost:8082` and the Express API on `http://localhost:3001`.

For a shareable HTTPS demo:

```bash
npm run demo
```

## Repository Structure

```text
.
|-- src/                # Frontend app, providers, hooks, and shared types
|-- server/             # Express API and security utilities
|-- docs/               # Deployment, architecture, onboarding, and runbooks
|-- tests/              # Playwright fixtures and browser tests
|-- .spec_system/       # Apex spec system state, PRD, sessions, and archives
\-- scripts/            # Local automation for dev, demo, and deploy tasks
```

## Documentation

- [Onboarding](docs/onboarding.md)
- [Development Guide](docs/development.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [CI/CD Operations Guide](docs/CI_CD.md)
- [OpenAI Translation Demo Guide](docs/OPENAI_TRANSLATION_DEMO.md)
- [Contributing](CONTRIBUTING.md)

## Scripts

- `npm run dev` - Vite frontend only
- `npm run dev:all` - Frontend plus backend
- `npm run server` - Express API only
- `npm run build` - Production frontend build
- `npm run test:run` - Vitest once
- `npm run test:e2e:ci` - Bounded Playwright CI subset
- `npm run docker:prod` - Start the production container and verify health
- `npm run demo` - Build production assets and launch ngrok demo mode

## Tech Stack

- React 19 and TypeScript for the UI
- Vite for frontend development and bundling
- Express for server routes, token minting, and health checks
- Playwright and Vitest for browser and unit coverage
- Docker and ngrok for production-like local runs and demos

## Provider Model

Supported tabs are controlled through environment flags and the shared provider order in `src/types/voice-provider.ts`:

- ElevenLabs Widget
- ElevenLabs SDK
- 60db (STT + TTS with a Claude brain)
- xAI Grok
- OpenAI Realtime
- OpenAI Translation
- Ultravox
- Vapi
- Retell
- Gemini Live

### 60db Voice Agent

60db exposes TTS + STT only (no LLM), so this tab assembles a full conversational
agent: **mic → VAD → 60db STT → Claude → 60db streaming TTS → playback**. Turn-taking
is hands-free (energy-based voice activity detection segments each utterance, since
60db STT is batch). Barge-in (speaking over the assistant) is supported.

All secrets stay server-side. The Express API proxies speech-to-text, the Claude
"brain", and the voice catalog, and relays the streaming-TTS WebSocket so the 60db
API key never reaches the browser:

- `GET  /api/60db/health` - configuration status
- `POST /api/60db/stt` - transcription proxy → `https://api.60db.ai/stt`
- `POST /api/60db/chat` - reply generation via the Anthropic Messages API
- `GET  /api/60db/voices` - account voice catalog → `/myvoices`
- `WS   /api/60db/tts` - relay to `wss://api.60db.ai/ws/tts` (key injected upstream)

Enable it with these environment variables (see `.env.example`):

```bash
# Frontend (build-time)
VITE_SIXTYDB_ENABLED=true
VITE_SIXTYDB_VOICE=<a voice_id from your 60db account>   # also pickable in-app

# Backend (server-side only, never sent to the browser)
SIXTYDB_API_KEY=<your 60db api key>
ANTHROPIC_API_KEY=<your anthropic api key>
# Optional: override the Claude model (default: claude-haiku-4-5-20251001)
# SIXTYDB_CHAT_MODEL=claude-sonnet-4-6
```

Then run `npm install` (pulls the `ws` server dependency) and `npm run dev:all`,
open the **60db** tab, pick a voice, click the mic, and just talk.
