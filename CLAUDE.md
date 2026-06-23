# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development

- **Start dev server**: `npm run dev` or `bun dev` - Runs on port 8082
- **Build production**: `npm run build` - Creates optimized build in `dist/`
- **Build development**: `npm run build:dev` - Development mode build
- **Preview build**: `npm run preview` - Preview production build locally
- **Lint code**: `npm run lint` - Run ESLint checks (MVP config: warnings only)
- **Format code**: `npm run format` - Format source files with Prettier
- **Check formatting**: `npm run format:check` - Check Prettier formatting without changes

### Testing

- **Run tests**: `npm run test` - Interactive test watcher with Vitest
- **Run tests once**: `npm run test:run` - Single test run for CI/CD
- **Test UI**: `npm run test:ui` - Visual test interface
- **Test setup**: Vitest + React Testing Library + jsdom environment
- **Mocks included**: Web Audio API, IntersectionObserver, ResizeObserver, matchMedia

## Architecture

### Technology Stack

- **Framework**: React 18.3.1 with TypeScript
- **Build Tool**: Vite with SWC for fast compilation
- **Styling**: Tailwind CSS with custom glassmorphism design system
- **UI Components**: Radix UI primitives wrapped in shadcn/ui pattern
- **Voice AI**: @elevenlabs/react SDK v0.12.1, OpenAI Realtime API, xAI Realtime API, Ultravox SDK, Vapi SDK, Retell SDK, Google Gemini Live API
- **Animations**: Framer Motion for smooth transitions
- **State**: React Context (theme), Tanstack Query (server state), custom hooks

### Project Structure

```
src/
|-- components/          # UI components
|   |-- voice/          # Voice-specific components
|   |   |-- VoiceButton.tsx # Voice interaction button
|   |   |-- VoiceStatus.tsx # Connection status display
|   |   |-- VoiceVisualizer.tsx # Audio visualization component
|   |   |-- VoiceSelector.tsx # Voice selection dropdown (Phase 02)
|   |   |-- ConversationPanel.tsx # Real-time transcript display (Phase 02)
|   |   |-- MessageBubble.tsx # Individual message component (Phase 02)
|   |   `-- FunctionCallIndicator.tsx # Function execution UI (Phase 02)
|   |-- providers/      # Provider-specific components
|   |   |-- ElevenLabsProvider.tsx # ElevenLabs voice interface
|   |   |-- OpenAIProvider.tsx # OpenAI Realtime interface
|   |   |-- XAIProvider.tsx # xAI Grok interface
|   |   |-- UltravoxProvider.tsx # Ultravox voice interface (Phase 04)
|   |   |-- VapiProvider.tsx # Vapi voice interface (Phase 05)
|   |   |-- RetellProvider.tsx # Retell voice interface (Phase 06)
|   |   |-- GeminiProvider.tsx # Gemini Live voice interface (Phase 00-Session 04)
|   |   `-- GeminiEmptyState.tsx # Gemini empty state component
|   |-- tabs/           # Tab navigation
|   |   |-- ProviderTabs.tsx # Provider tab container
|   |   `-- ProviderTab.tsx # Individual tab component
|   |-- BackgroundEffects.tsx # Dynamic background animations
|   |-- HeroSection.tsx # Landing page hero section
|   |-- VoiceEnvironment.tsx # 3D voice environment
|   |-- ConfigurationModal.tsx # Settings modal
|   `-- ui/             # 50+ shadcn/ui components
|-- hooks/              # Business logic
|   |-- useAccessibility.ts # Accessibility features
|   |-- useReconnection.ts # WebSocket reconnection with backoff (Phase 02)
|   |-- useVapiVoice.ts # Vapi voice hook (Phase 05)
|   |-- useRetellVoice.ts # Retell voice hook (Phase 06)
|   |-- useGeminiVoice.ts # Gemini Live voice hook (Phase 00-Session 04)
|   |-- use-mobile.tsx  # Mobile detection hook
|   `-- use-toast.ts    # Toast notifications
|-- pages/              # Route components
|   |-- Index.tsx       # Main app page (uses env vars for Agent ID)
|   `-- NotFound.tsx    # 404 error page
|-- test/               # Test infrastructure (215+ tests)
|   |-- setup.ts        # Test configuration and mocks
|   |-- useReconnection.test.ts # Reconnection logic tests
|   |-- voiceConfig.test.ts # Voice selection tests
|   |-- ConversationPanel.test.tsx # Transcript tests
|   `-- ... (14 test files total)
|-- contexts/           # Global state
|   |-- ThemeContext.tsx # Dark/light theme management
|   |-- VoiceContext.tsx # ElevenLabs voice state
|   |-- XAIVoiceContext.tsx # xAI voice state with reconnection (Phase 02)
|   |-- OpenAIVoiceContext.tsx # OpenAI voice state with reconnection (Phase 02)
|   |-- UltravoxVoiceContext.tsx # Ultravox voice state (Phase 04)
|   |-- GeminiVoiceContext.tsx # Gemini Live voice state (Phase 00-Session 04)
|   `-- ProviderContext.tsx # Active provider selection
`-- lib/                # Utilities
    |-- utils.ts        # Helper functions
    |-- audio/          # Audio processing (Phase 02)
    |   `-- audioUtils.ts # PCM encoding, base64 conversion
    |-- gemini/          # Gemini Live infrastructure (Phase 00-Session 04)
    |   |-- genai-live-client.ts # WebSocket client for Gemini Live API
    |   |-- audio-recorder.ts # PCM audio capture for Gemini
    |   |-- audio-streamer.ts # PCM audio playback for Gemini
    |   `-- config.ts # Gemini configuration constants
    `-- tools/          # Function calling (Phase 02)
        `-- toolDefinitions.ts # Weather, time, calculator tools
```

### Environment Variables

- **Required**: `.env` file with credentials (not tracked by git)
- **Template**: `.env.example` shows required format
- **Frontend Variables** (VITE\_ prefix):
  - `VITE_ELEVENLABS_AGENT_ID` - ElevenLabs Agent ID (used by both Widget and SDK)
  - `VITE_ELEVENLABS_ENABLED` - Enable ElevenLabs Widget tab (true/false)
  - `VITE_ELEVENLABS_SDK_ENABLED` - Enable ElevenLabs SDK tab (true/false)
  - `VITE_XAI_ENABLED` - Enable xAI provider tab (true/false)
  - `VITE_OPENAI_ENABLED` - Enable OpenAI provider tab (true/false)
  - `VITE_ULTRAVOX_ENABLED` - Enable Ultravox provider tab (true/false)
  - `VITE_VAPI_ENABLED` - Enable Vapi provider tab (true/false)
  - `VITE_VAPI_WEB_TOKEN` - Vapi public web token (frontend-safe)
  - `VITE_VAPI_ASSISTANT_ID` - Optional pre-created Vapi assistant ID
  - `VITE_VAPI_VOICE` - Vapi voice ID (default: paula)
  - `VITE_RETELL_ENABLED` - Enable Retell provider tab (true/false)
  - `VITE_RETELL_AGENT_ID` - Retell Agent ID (from Retell dashboard)
  - `VITE_GEMINI_ENABLED` - Enable Gemini Live provider tab (true/false)
  - `VITE_GEMINI_VOICE` - Gemini voice (default: Aoede)
  - `VITE_API_BASE_URL` - Backend API URL (default: http://localhost:3001)
  - `VITE_OPENAI_VOICE` / `VITE_XAI_VOICE` / `VITE_ULTRAVOX_VOICE` - Default voice selection
- **Backend Variables** (server-side only):
  - `ELEVENLABS_API_KEY` - ElevenLabs API key
  - `XAI_API_KEY` - xAI API key for Grok
  - `OPENAI_API_KEY` - OpenAI API key for Realtime API
  - `ULTRAVOX_API_KEY` - Ultravox API key
  - `RETELL_API_KEY` - Retell API key for creating web call tokens
  - `GEMINI_API_KEY` - Google Gemini API key for Live API
  - `CORS_ORIGIN` - Allowed frontend origin

### Key Integration Points

1. **ElevenLabs Voice Agent** (Two Modes Available as Separate Tabs):
   - **Widget Mode** (`elevenlabs` tab): Pre-built embed from ElevenLabs CDN
     - Uses `VoiceWidget.tsx` component with `<elevenlabs-convai>` web component
     - Customizable via VITE*WIDGET*\* environment variables (colors, text, avatar)
     - Self-contained UI - no custom components needed
   - **SDK Mode** (`elevenlabs-sdk` tab): Custom React UI with @elevenlabs/react SDK
     - Uses `VoiceContext.tsx` with `useConversation()` hook
     - Full control over UI with VoiceButton, VoiceVisualizer, VoiceStatus components
     - Access to MediaStream for custom audio processing
   - Agent ID shared via `VITE_ELEVENLABS_AGENT_ID`
   - Requires HTTPS in production for microphone access

2. **OpenAI Realtime API** (Phase 02):
   - Uses ephemeral tokens from backend (60s expiry for security)
   - WebSocket connection at `wss://api.openai.com/v1/realtime`
   - Protocol array auth: `['realtime', 'openai-insecure-api-key.{token}']`
   - 8 voices available: alloy, ash, ballad, coral, echo, sage, shimmer, verse

3. **xAI Realtime API** (Phase 02):
   - Uses ephemeral tokens from backend
   - WebSocket connection at `wss://api.x.ai/v1/realtime`
   - 5 voices available: ash, ballad, coral, sage, verse

4. **Ultravox Voice API** (Phase 04):
   - Uses call-based model with backend-generated joinUrl
   - Backend creates call via Ultravox REST API, returns WebSocket URL
   - `UltravoxVoiceContext.tsx` manages session state and transcripts
   - `ultravox-client` SDK handles WebSocket connection and audio
   - Voice selection via `VITE_ULTRAVOX_VOICE` (default: Mark)
   - Supports speaking, listening, and thinking states

5. **Vapi Voice API** (Phase 05):
   - Uses public web token (frontend-safe, no backend required)
   - `@vapi-ai/web` SDK handles all connection and audio
   - `useVapiVoice.ts` hook manages call state and transcripts
   - `VapiProvider.tsx` provides UI components (VapiButton, VapiVoiceStatus)
   - Supports inline assistant config or pre-created assistant ID
   - 7 events: call-start, call-end, speech-start, speech-end, volume-level, message, error
   - Partial transcript support via `activeTranscript` for typing indicators
   - Function calling via `CreateAssistantDTO.model.functions`

6. **Retell Voice API** (Phase 06):
   - Uses backend-generated access tokens for secure WebRTC connections
   - `retell-client-js-sdk` SDK handles audio streaming via LiveKit
   - `useRetellVoice.ts` hook manages call state and transcript accumulation
   - `RetellProvider.tsx` provides UI components (RetellButton, RetellVoiceStatus, RetellEmptyState)
   - Agent configuration managed in Retell dashboard (voice, LLM, prompts)
   - 6 events: call_started, call_ended, agent_start_talking, agent_stop_talking, update, error
   - Local transcript accumulation (SDK only provides last 5 sentences)
   - Teal/cyan color scheme to distinguish from other providers

7. **Gemini Live API** (Phase 00-Session 04):
   - Uses ephemeral tokens from backend for secure WebSocket connections
   - WebSocket connection at `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent`
   - `GenAILiveClient` handles WebSocket messaging with typed event system
   - `GeminiAudioRecorder` captures PCM audio at 16kHz mono
   - `GeminiAudioStreamer` plays 24kHz PCM audio responses
   - `GeminiVoiceContext.tsx` manages connection state, transcripts, session timer
   - `useGeminiVoice.ts` hook provides type-safe access to context
   - 5 voices available: Puck, Charon, Kore, Fenrir, Aoede
   - 15-minute session limit with warnings at 12min/14min
   - Barge-in support with immediate audio queue clearing
   - Thinking state detection (300ms after user speech ends)
   - Voice Activity Detection (VAD) for automatic turn-taking
   - Emerald/green color scheme to distinguish from other providers

8. **60db Voice Agent** (STT + TTS + Claude brain):
   - 60db provides TTS + STT primitives only (no LLM), so this tab assembles a
     full conversational agent: mic → VAD → 60db STT → Claude → 60db streaming TTS → playback
   - Hands-free turn-taking via client-side energy VAD (`lib/sixtydb/vad.ts`),
     which segments utterances since 60db STT is batch (needs a complete utterance)
   - All secrets stay server-side: `server/routes/sixtydb.js` proxies STT (`/api/60db/stt`),
     the Claude brain (`/api/60db/chat`, plain fetch to the Anthropic Messages API),
     and the voice catalog (`/api/60db/voices` → `/myvoices`)
   - Streaming TTS uses a backend WebSocket relay (`server/ws/sixtydb-tts.js`,
     attached to the HTTP server) so `SIXTYDB_API_KEY` never reaches the browser;
     the browser speaks the native 60db protocol (create_context/send_text/flush_context)
     over `/api/60db/tts` via `lib/sixtydb/tts-client.ts`
   - `SixtyDbVoiceContext.tsx` orchestrates the loop; `useSixtyDbVoice.ts` exposes it
   - LINEAR16 PCM16 @24kHz playback via `lib/sixtydb/audio-streamer.ts`; barge-in supported
   - Requires `SIXTYDB_API_KEY` + `ANTHROPIC_API_KEY` (backend), `VITE_SIXTYDB_ENABLED`
     and a `VITE_SIXTYDB_VOICE` id (account-specific). Adds the `ws` server dependency.
   - Claude model configurable via `SIXTYDB_CHAT_MODEL` (default `claude-haiku-4-5-20251001`)
   - Violet color scheme to distinguish from other providers

9. **Reconnection with Backoff** (Phase 02):
   - Automatic reconnection on WebSocket disconnect
   - Exponential backoff: 1s, 2s, 4s, 8s, up to 30s max
   - Maximum 10 retry attempts
   - `useReconnection.ts` hook handles logic

9. **Function Calling** (Phase 02):
   - Tool definitions in `lib/tools/toolDefinitions.ts`
   - Demo tools: weather, time, calculator
   - Results displayed via `FunctionCallIndicator.tsx`
   - AI incorporates function results into responses

10. **Audio Visualization**:

- `VoiceVisualizer.tsx` uses Web Audio API for real-time frequency analysis
- Canvas-based rendering optimized for 60fps
- Integrates with voice state from conversation events

11. **Theme System**:

- Glassmorphism design with backdrop-filter effects
- Theme toggle persists to localStorage
- CSS variables defined in Tailwind config

12. **Configuration Modal** (Phase 03):

- Provider settings accessible via ConfigurationModal.tsx
- Uses ConfigurationDialog.tsx (Radix UI Dialog) for advanced settings
- Proper ARIA attributes (role="dialog", aria-modal, aria-labelledby)
- Settings persistence via settingsStorage.ts

13. **E2E Testing Infrastructure** (Phase 03):

- Playwright-based end-to-end tests in `tests/e2e/`
- Multi-browser support (Chromium, Firefox, WebKit)
- Voice flow testing with mocked providers
- Test fixtures and utilities in `tests/e2e/fixtures/`

### Development Guidelines

1. **Component Patterns**:
   - Use TypeScript interfaces for all props
   - Follow existing shadcn/ui component patterns in `components/ui/`
   - Animations should respect `prefers-reduced-motion`

2. **Performance**:
   - Audio visualizations are throttled to 60fps
   - Mobile optimizations via `use-mobile` hook
   - Lazy loading for heavy components

3. **State Management**:
   - Theme: Context API (`ThemeContext`)
   - Server data: Tanstack Query
   - Local state: Custom hooks pattern
   - Voice state: Provider-specific contexts (`VoiceContext`, `XAIVoiceContext`, `OpenAIVoiceContext`, `UltravoxVoiceContext`, `GeminiVoiceContext`)
   - Provider selection: `ProviderContext` with localStorage persistence
   - Reconnection state: `useReconnection` hook (Phase 02)
   - Conversation history: Stored in provider contexts (Phase 02)

4. **Styling**:
   - Tailwind utilities first
   - Custom CSS only for complex animations
   - Glassmorphism effects use backdrop-blur and semi-transparent backgrounds

### Production Considerations

1. **Security**:
   - Environment variables properly configured (.env ignored by git)
   - API keys stored in environment variables (not hardcoded)
   - Consider backend proxy for production API key management
   - Never commit .env files to repository

2. **Browser Requirements**:
   - HTTPS required for microphone access
   - Modern browser with Web Audio API support
   - Safari may require user gesture for audio initialization

3. **Mobile Support**:
   - Touch targets minimum 44px
   - Responsive breakpoints: 375px, 768px, 1024px
   - Background tab throttling affects audio visualization

4. **Accessibility** (Phase 03):
   - All modals have proper ARIA attributes (role="dialog", aria-modal, aria-labelledby)
   - Error messages use role="alert" for screen reader announcements
   - Loading states use aria-busy for accessibility
   - Focus management via useAccessibility.ts hook
   - Reduced motion support via useReducedMotion hook
