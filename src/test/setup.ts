import '@testing-library/jest-dom/vitest';
import { vi, beforeAll, afterAll } from 'vitest';

// Suppress jsdom Canvas warning - this must be done before any Canvas elements are created
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const message = args[0];
    if (typeof message === 'string' && message.includes('HTMLCanvasElement')) {
      return; // Suppress Canvas-related warnings from jsdom
    }
    originalConsoleError.apply(console, args);
  };
});

afterAll(() => {
  console.error = originalConsoleError;
});

// Mock gradient object
const mockGradient = {
  addColorStop: vi.fn(),
};

// Mock HTMLCanvasElement.getContext to avoid jsdom warning
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(() => ({ data: [] })),
    putImageData: vi.fn(),
    createImageData: vi.fn(() => []),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    fillText: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    transform: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    createRadialGradient: vi.fn(() => mockGradient),
    createLinearGradient: vi.fn(() => mockGradient),
    fillStyle: '',
    strokeStyle: '',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    shadowBlur: 0,
    shadowColor: 'transparent',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    canvas: { width: 800, height: 600 },
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}

// Mock IntersectionObserver for components that use it
class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = '0px';
  readonly scrollMargin = '0px';
  readonly thresholds = [];

  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
}

global.IntersectionObserver = MockIntersectionObserver;

// Mock ResizeObserver for components that use it
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Mock matchMedia for components that use it
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// Mock Web Audio API for AudioVisualizer component
class MockAudioContext {
  constructor() {}
  createAnalyser() {
    return {
      connect: vi.fn(),
      disconnect: vi.fn(),
      fftSize: 256,
      frequencyBinCount: 128,
      getByteFrequencyData: vi.fn(),
    };
  }
  createGain() {
    return {
      connect: vi.fn(),
      disconnect: vi.fn(),
      gain: { value: 1 },
    };
  }
}

global.AudioContext = MockAudioContext as unknown as typeof AudioContext;

// Mock navigator.mediaDevices for microphone access
if (typeof navigator !== 'undefined') {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [],
      }),
    },
  });
}

// Mock Daily call object for Vapi SDK
export const mockDailyCall = {
  updateInputSettings: vi.fn().mockResolvedValue(undefined),
};

// Mock Vapi SDK (@vapi-ai/web)
// Follows same pattern as Ultravox mocks with event emitter support
// Export functions to allow resetting between tests
export const vapiMocks = {
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  getDailyCallObject: vi.fn(() => mockDailyCall),
  // Track registered event handlers for testing
  eventHandlers: new Map<string, Set<(...args: unknown[]) => void>>(),
  // Helper to emit events in tests
  emit: (event: string, ...args: unknown[]) => {
    const handlers = vapiMocks.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(...args));
    }
  },
  // Reset all mocks and event handlers
  reset: () => {
    vapiMocks.start.mockClear();
    vapiMocks.stop.mockClear();
    vapiMocks.on.mockClear();
    vapiMocks.off.mockClear();
    vapiMocks.getDailyCallObject.mockClear();
    mockDailyCall.updateInputSettings.mockClear();
    vapiMocks.eventHandlers.clear();
  },
};

// Mock Vapi class with event emitter pattern
vi.mock('@vapi-ai/web', () => {
  return {
    default: class MockVapi {
      constructor(_token: string) {
        // Token is accepted but not stored in mock
      }
      start = vi.fn((...args: unknown[]) => vapiMocks.start(...args));
      stop = vi.fn(() => vapiMocks.stop());
      getDailyCallObject = vi.fn(() => vapiMocks.getDailyCallObject());
      on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (!vapiMocks.eventHandlers.has(event)) {
          vapiMocks.eventHandlers.set(event, new Set());
        }
        vapiMocks.eventHandlers.get(event)?.add(handler);
        vapiMocks.on(event, handler);
      });
      off = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        vapiMocks.eventHandlers.get(event)?.delete(handler);
        vapiMocks.off(event, handler);
      });
    },
  };
});

// Mock Retell SDK (retell-client-js-sdk)
// Follows same pattern as Vapi mocks with event emitter support
// Export functions to allow resetting between tests
export const retellMocks = {
  startCall: vi.fn().mockResolvedValue(undefined),
  stopCall: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  // Track registered event handlers for testing
  eventHandlers: new Map<string, Set<(...args: unknown[]) => void>>(),
  // Helper to emit events in tests
  emit: (event: string, ...args: unknown[]) => {
    const handlers = retellMocks.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(...args));
    }
  },
  // Reset all mocks and event handlers
  reset: () => {
    retellMocks.startCall.mockClear();
    retellMocks.stopCall.mockClear();
    retellMocks.on.mockClear();
    retellMocks.off.mockClear();
    retellMocks.eventHandlers.clear();
  },
};

// Mock RetellWebClient class with event emitter pattern
vi.mock('retell-client-js-sdk', () => {
  return {
    RetellWebClient: class MockRetellWebClient {
      startCall = vi.fn((...args: unknown[]) => retellMocks.startCall(...args));
      stopCall = vi.fn(() => retellMocks.stopCall());
      on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        if (!retellMocks.eventHandlers.has(event)) {
          retellMocks.eventHandlers.set(event, new Set());
        }
        retellMocks.eventHandlers.get(event)?.add(handler);
        retellMocks.on(event, handler);
      });
      off = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        retellMocks.eventHandlers.get(event)?.delete(handler);
        retellMocks.off(event, handler);
      });
    },
  };
});

// Mock Ultravox SDK (ultravox-client)
// Follows same pattern as ElevenLabs and xAI/OpenAI mocks
// Export functions to allow resetting between tests
export const ultravoxMocks = {
  joinCall: vi.fn(),
  leaveCall: vi.fn().mockResolvedValue(undefined),
  muteMic: vi.fn(),
  unmuteMic: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

// Mock session object that the constructor returns
export const mockUltravoxSession = {
  status: 'disconnected',
  transcripts: [] as Array<{
    text: string;
    isFinal: boolean;
    speaker: string;
    medium: string;
    ordinal: number;
  }>,
  get joinCall() {
    return ultravoxMocks.joinCall;
  },
  get leaveCall() {
    return ultravoxMocks.leaveCall;
  },
  get muteMic() {
    return ultravoxMocks.muteMic;
  },
  get unmuteMic() {
    return ultravoxMocks.unmuteMic;
  },
  get addEventListener() {
    return ultravoxMocks.addEventListener;
  },
  get removeEventListener() {
    return ultravoxMocks.removeEventListener;
  },
};

// Use a class mock for proper constructor behavior
vi.mock('ultravox-client', () => {
  return {
    UltravoxSession: class MockUltravoxSession {
      status = 'disconnected';
      transcripts: Array<{
        text: string;
        isFinal: boolean;
        speaker: string;
        medium: string;
        ordinal: number;
      }> = [];
      joinCall = ultravoxMocks.joinCall;
      leaveCall = ultravoxMocks.leaveCall;
      muteMic = ultravoxMocks.muteMic;
      unmuteMic = ultravoxMocks.unmuteMic;
      addEventListener = ultravoxMocks.addEventListener;
      removeEventListener = ultravoxMocks.removeEventListener;
    },
  };
});

// Mock Gemini SDK and related modules
// NOTE: These mocks are exported for use in component tests (src/test/).
// The library unit tests (src/lib/gemini/__tests__/) test real implementations.
// Follows same pattern as other provider mocks with event emitter support
export const geminiMocks = {
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  sendRealtimeInput: vi.fn(),
  isConnected: false,
  // Track registered event handlers for testing
  eventHandlers: new Map<string, Set<(...args: unknown[]) => void>>(),
  // Helper to emit events in tests
  emit: (event: string, ...args: unknown[]) => {
    const handlers = geminiMocks.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(...args));
    }
  },
  // Reset all mocks and event handlers
  reset: () => {
    geminiMocks.connect.mockClear();
    geminiMocks.disconnect.mockClear();
    geminiMocks.sendRealtimeInput.mockClear();
    geminiMocks.isConnected = false;
    geminiMocks.eventHandlers.clear();
  },
};

// NOTE: Gemini library modules are NOT mocked at setup level to allow
// src/lib/gemini/__tests__/ to test real implementations.
// Component tests that need mocks should define them locally.
// See GeminiProvider.test.tsx for example of local mocking.
