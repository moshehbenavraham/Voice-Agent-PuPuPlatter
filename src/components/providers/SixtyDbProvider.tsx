import { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MicOff,
  Loader2,
  Mic,
  AlertCircle,
  Wifi,
  WifiOff,
  ChevronDown,
  Check,
  Square,
  Settings,
} from 'lucide-react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { useSixtyDbVoice } from '@/hooks/useSixtyDbVoice';
import { SixtyDbVoiceProvider } from '@/contexts/SixtyDbVoiceContext';
import { checkSixtyDbConfiguration } from '@/lib/sixtydb/config';
import { getApiBaseUrl } from '@/lib/apiConfig';
import type { SixtyDbVoice } from '@/types/sixtydb';
import { cn } from '@/lib/utils';

// 60db uses a violet color scheme (HSL ~270) to distinguish it from the
// amber (ElevenLabs), emerald (Gemini) and teal (Retell) providers.

/**
 * Frontend configuration check (the real keys live on the backend).
 */
// eslint-disable-next-line react-refresh/only-export-components
export { checkSixtyDbConfiguration };

// eslint-disable-next-line react-refresh/only-export-components
export function useSixtyDbConfigured(): { isConfigured: boolean; isChecking: boolean } {
  return { isConfigured: checkSixtyDbConfiguration(), isChecking: false };
}

interface SixtyDbProviderProps {
  children?: ReactNode;
  onDisconnect?: () => void;
  disconnectRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}

/**
 * Inner component: exposes disconnect for provider switching and ensures cleanup.
 */
function SixtyDbProviderInner({
  children,
  onDisconnect,
  disconnectRef: externalDisconnectRef,
}: SixtyDbProviderProps) {
  const { disconnect, status } = useSixtyDbVoice();
  const wasConnectedRef = useRef(false);
  const internalDisconnectRef = useRef(disconnect);

  useEffect(() => {
    internalDisconnectRef.current = disconnect;
  }, [disconnect]);

  useEffect(() => {
    if (externalDisconnectRef) {
      externalDisconnectRef.current = disconnect;
    }
    return () => {
      if (externalDisconnectRef) {
        externalDisconnectRef.current = null;
      }
    };
  }, [disconnect, externalDisconnectRef]);

  useEffect(() => {
    const isConnected =
      status === 'connected' ||
      status === 'listening' ||
      status === 'speaking' ||
      status === 'thinking';
    if (isConnected) {
      wasConnectedRef.current = true;
    } else if (wasConnectedRef.current && status === 'idle') {
      wasConnectedRef.current = false;
      onDisconnect?.();
    }
  }, [status, onDisconnect]);

  useEffect(() => {
    return () => {
      internalDisconnectRef.current();
    };
  }, []);

  return <>{children}</>;
}

/**
 * 60db Voice Provider wrapper - provides the conversational agent context.
 */
export function SixtyDbProvider({ children, onDisconnect, disconnectRef }: SixtyDbProviderProps) {
  return (
    <SixtyDbVoiceProvider onDisconnect={onDisconnect}>
      <SixtyDbProviderInner onDisconnect={onDisconnect} disconnectRef={disconnectRef}>
        {children}
      </SixtyDbProviderInner>
    </SixtyDbVoiceProvider>
  );
}

interface SixtyDbButtonProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  onConnect?: () => void;
  onDisconnect?: () => void;
}

/**
 * Voice button for the 60db provider with color state transitions.
 */
export function SixtyDbButton({ className, size = 'lg', onConnect }: SixtyDbButtonProps) {
  const { status, isSpeaking, isListening, isThinking, connect, disconnect, error } =
    useSixtyDbVoice();
  const buttonRef = useRef<HTMLButtonElement>(null);

  const isConnected =
    status === 'connected' ||
    status === 'listening' ||
    status === 'speaking' ||
    status === 'thinking';
  const isLoading = status === 'connecting';

  const sizeConfig = {
    sm: { button: 'w-16 h-16', icon: 18, rings: [24, 32] },
    md: { button: 'w-24 h-24', icon: 24, rings: [36, 48] },
    lg: { button: 'w-32 h-32', icon: 32, rings: [48, 64, 80] },
  };
  const config = sizeConfig[size];

  const handleClick = useCallback(async () => {
    if (isLoading) return;
    if (isConnected) {
      await disconnect();
    } else {
      await connect();
      onConnect?.();
    }
  }, [isLoading, isConnected, connect, disconnect, onConnect]);

  useEffect(() => {
    if (error && buttonRef.current) {
      buttonRef.current.focus();
    }
  }, [error]);

  const getState = () => {
    if (isLoading) return 'loading';
    if (isSpeaking) return 'speaking';
    if (isThinking) return 'thinking';
    if (isListening) return 'listening';
    if (isConnected) return 'connected';
    if (error) return 'error';
    return 'idle';
  };
  const stateValue = getState();

  const getAriaLabel = () => {
    switch (stateValue) {
      case 'loading':
        return 'Connecting to 60db...';
      case 'speaking':
        return '60db is speaking. Click to end call.';
      case 'thinking':
        return 'Thinking. Click to end call.';
      case 'listening':
        return 'Listening. Click to end call.';
      case 'connected':
        return 'Connected to 60db. Click to end call.';
      case 'error':
        return `Error: ${error}. Click to retry.`;
      default:
        return 'Start 60db voice conversation';
    }
  };

  const glowIntensity = useMemo(() => {
    if (!isConnected) return 0;
    if (isSpeaking) return 0.9;
    if (isThinking) return 0.6;
    if (isListening) return 0.5;
    return 0.3;
  }, [isConnected, isSpeaking, isThinking, isListening]);

  const glowColor = isSpeaking
    ? `hsla(270, 70%, 55%, ${0.2 + glowIntensity * 0.4})`
    : isThinking
      ? `hsla(270, 60%, 50%, ${0.15 + glowIntensity * 0.3})`
      : `hsla(270, 50%, 45%, ${0.1 + glowIntensity * 0.2})`;
  const glowSpread = 10 + glowIntensity * 30;

  return (
    <div className={cn('relative flex items-center justify-center', className)}>
      {/* Concentric rings */}
      {config.rings.map((ringSize, index) => (
        <motion.div
          key={ringSize}
          className="absolute rounded-full border"
          style={{
            width: ringSize * 2,
            height: ringSize * 2,
            borderColor: isConnected
              ? `hsla(270, 70%, 55%, ${0.15 - index * 0.03})`
              : stateValue === 'loading'
                ? `hsla(45, 80%, 50%, ${0.1 - index * 0.02})`
                : `hsla(0, 0%, 100%, ${0.06 - index * 0.01})`,
          }}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{
            scale: stateValue === 'speaking' || stateValue === 'thinking' ? [1, 1.05, 1] : 1,
            opacity: 1,
          }}
          transition={{
            scale: {
              duration: stateValue === 'speaking' ? 1.5 : 2,
              repeat: stateValue === 'speaking' || stateValue === 'thinking' ? Infinity : 0,
              ease: 'easeInOut',
              delay: index * 0.1,
            },
            opacity: { duration: 0.4, delay: index * 0.1 },
          }}
        />
      ))}

      {/* Pulse rings when speaking */}
      <AnimatePresence>
        {isSpeaking &&
          [0, 1, 2].map((i) => (
            <motion.div
              key={`pulse-${i}`}
              className="absolute rounded-full border-2 border-violet-400/40"
              style={{
                width: config.rings[config.rings.length - 1] * 2,
                height: config.rings[config.rings.length - 1] * 2,
              }}
              initial={{ scale: 1, opacity: 0.6 }}
              animate={{ scale: 2, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeOut', delay: i * 0.6 }}
            />
          ))}
      </AnimatePresence>

      {/* Main button */}
      <motion.button
        ref={buttonRef}
        onClick={handleClick}
        disabled={isLoading}
        className={cn(
          config.button,
          'relative z-10 rounded-full flex items-center justify-center transition-all duration-300',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-4 focus-visible:ring-offset-zinc-900',
          'disabled:cursor-not-allowed',
          {
            'bg-zinc-900 border border-zinc-700/50 hover:border-zinc-600': stateValue === 'idle',
            'bg-zinc-900 border border-amber-500/30': stateValue === 'loading',
            'bg-zinc-900 border border-violet-500/50':
              stateValue === 'connected' ||
              stateValue === 'speaking' ||
              stateValue === 'listening' ||
              stateValue === 'thinking',
            'bg-zinc-900 border border-red-500/50': stateValue === 'error',
          }
        )}
        style={{ boxShadow: isConnected ? `0 0 ${glowSpread}px -5px ${glowColor}` : undefined }}
        whileHover={{ scale: isLoading ? 1 : 1.02 }}
        whileTap={{ scale: isLoading ? 1 : 0.98 }}
        aria-label={getAriaLabel()}
        aria-pressed={isConnected}
        role="button"
        data-testid="voice-button"
        data-state={stateValue}
      >
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Loader2 size={config.icon} className="text-amber-400 animate-spin" />
            </motion.div>
          ) : isConnected ? (
            <motion.div
              key="connected"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="relative"
            >
              <Square size={config.icon} className="text-violet-400" fill="currentColor" />
              <motion.div
                data-testid="voice-button-active-indicator"
                className={cn(
                  'absolute -top-1 -right-1 w-3 h-3 rounded-full',
                  isSpeaking ? 'bg-violet-400' : isThinking ? 'bg-amber-400' : 'bg-violet-500'
                )}
                animate={{ scale: [1, 1.2, 1], opacity: [0.8, 1, 0.8] }}
                transition={{ duration: isThinking ? 1 : 1.5, repeat: Infinity, ease: 'easeInOut' }}
              />
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
              {error ? (
                <MicOff size={config.icon} className="text-red-400" />
              ) : (
                <Mic size={config.icon} className="text-zinc-400" />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Status label */}
      <motion.div
        className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap"
        initial={{ opacity: 0, y: -5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        data-testid="voice-button-status"
      >
        <span
          className={cn('font-mono text-xs tracking-wide uppercase', {
            'text-zinc-500': stateValue === 'idle',
            'text-amber-400/80': stateValue === 'loading' || stateValue === 'thinking',
            'text-violet-400':
              stateValue === 'connected' || stateValue === 'speaking' || stateValue === 'listening',
            'text-red-400': stateValue === 'error',
          })}
        >
          {stateValue === 'idle' && 'Ready'}
          {stateValue === 'loading' && 'Connecting'}
          {stateValue === 'connected' && 'Live'}
          {stateValue === 'listening' && 'Listening'}
          {stateValue === 'thinking' && 'Thinking'}
          {stateValue === 'speaking' && 'Speaking'}
          {stateValue === 'error' && 'Error'}
        </span>
      </motion.div>
    </div>
  );
}

interface SixtyDbVoiceStatusProps {
  className?: string;
}

/**
 * Connection + activity status bar for the 60db provider.
 */
export function SixtyDbVoiceStatus({ className }: SixtyDbVoiceStatusProps) {
  const { status, isSpeaking, isListening, isThinking, error } = useSixtyDbVoice();

  const isConnected =
    status === 'connected' ||
    status === 'listening' ||
    status === 'speaking' ||
    status === 'thinking';
  const isLoading = status === 'connecting';

  const getStatusText = () => {
    if (error) return 'Connection Error';
    if (isLoading) return 'Connecting to 60db...';
    if (isSpeaking) return '60db is speaking';
    if (isThinking) return 'Thinking...';
    if (isListening) return 'Listening - speak now';
    if (isConnected) return 'Connected - Ready';
    return 'Disconnected';
  };

  return (
    <div className={cn('space-y-4', className)}>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'flex items-center justify-between px-4 py-3 rounded-lg border backdrop-blur-sm transition-all duration-300',
          {
            'border-zinc-800/50 bg-zinc-900/50': !isConnected && !error && !isLoading,
            'border-amber-500/20 bg-amber-500/5': isLoading || isThinking,
            'border-violet-500/30 bg-violet-500/5': isConnected && !isThinking,
            'border-red-500/30 bg-red-500/5': error,
          }
        )}
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <div
              className={cn('w-2 h-2 rounded-full', {
                'bg-zinc-600': !isConnected && !error && !isLoading,
                'bg-amber-400': isLoading || isThinking,
                'bg-violet-400': isConnected && !isThinking,
                'bg-red-400': error,
              })}
            />
            {(isLoading || isSpeaking || isThinking) && (
              <div
                className={cn('absolute inset-0 w-2 h-2 rounded-full animate-ping', {
                  'bg-amber-400': isLoading || isThinking,
                  'bg-violet-400': isSpeaking,
                })}
              />
            )}
          </div>
          <span
            className={cn('text-sm font-medium', {
              'text-zinc-500': !isConnected && !error && !isLoading,
              'text-amber-400/90': isLoading || isThinking,
              'text-zinc-300': isConnected && !isThinking && !isSpeaking,
              'text-violet-400/90': isSpeaking || isListening,
              'text-red-400/90': error,
            })}
          >
            {getStatusText()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {error ? (
            <AlertCircle className="w-4 h-4 text-red-400" />
          ) : isConnected ? (
            <Wifi className="w-4 h-4 text-violet-400/70" />
          ) : (
            <WifiOff className="w-4 h-4 text-zinc-600" />
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 py-3 rounded-lg bg-red-500/5 border border-red-500/20 text-sm text-red-300/80"
            role="alert"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SixtyDbVoiceSelectorProps {
  className?: string;
}

/**
 * Voice selector for the 60db provider. Loads the account's voice catalog from
 * the backend (/api/60db/voices -> /myvoices) at runtime.
 */
export function SixtyDbVoiceSelector({ className }: SixtyDbVoiceSelectorProps) {
  const { selectedVoice, setVoice, isConnected } = useSixtyDbVoice();
  const [voices, setVoices] = useState<SixtyDbVoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/60db/voices`, { credentials: 'include' });
        if (!res.ok) throw new Error(`voices ${res.status}`);
        const data = await res.json();
        const list: SixtyDbVoice[] = Array.isArray(data?.data) ? data.data : [];
        if (!cancelled) setVoices(list);
      } catch {
        if (!cancelled) setVoices([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const current = voices.find((v) => v.voice_id === selectedVoice);
  const triggerLabel = current?.name || (selectedVoice ? selectedVoice : 'Select voice');

  return (
    <div className={cn('w-full', className)}>
      <label className="block text-sm text-zinc-400 mb-2">Voice</label>
      <SelectPrimitive.Root value={selectedVoice} onValueChange={setVoice} disabled={isConnected}>
        <SelectPrimitive.Trigger
          className={cn(
            'flex items-center justify-between w-full px-4 py-3 rounded-lg',
            'bg-zinc-900/50 border border-zinc-700/50 text-sm text-zinc-200',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50',
            'disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:border-zinc-600'
          )}
          aria-label="Select voice"
          data-testid="voice-selector"
        >
          <span className="truncate">{loading ? 'Loading voices...' : triggerLabel}</span>
          <SelectPrimitive.Icon>
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            className={cn(
              'z-50 min-w-[280px] max-h-[400px] overflow-hidden',
              'bg-zinc-900 border border-zinc-700/50 rounded-lg shadow-xl backdrop-blur-xl'
            )}
            position="popper"
            sideOffset={5}
          >
            <SelectPrimitive.Viewport className="p-2">
              {voices.length === 0 ? (
                <div className="px-3 py-2 text-xs text-zinc-500">
                  No voices found. Add a voice in your 60db account.
                </div>
              ) : (
                voices.map((voice) => (
                  <SelectPrimitive.Item
                    key={voice.voice_id}
                    value={voice.voice_id}
                    className={cn(
                      'relative flex items-center justify-between px-3 py-2 rounded-md text-sm text-zinc-300 cursor-pointer outline-none',
                      'data-[highlighted]:bg-violet-500/10 data-[highlighted]:text-violet-400',
                      'data-[state=checked]:text-violet-400 transition-colors duration-150'
                    )}
                  >
                    <SelectPrimitive.ItemText>
                      {voice.name}
                      {voice.labels?.accent ? ` (${voice.labels.accent})` : ''}
                    </SelectPrimitive.ItemText>
                    <SelectPrimitive.ItemIndicator>
                      <Check className="w-4 h-4 text-violet-400" />
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                ))
              )}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>

      {isConnected && (
        <p className="mt-2 text-xs text-zinc-500">
          Voice selection is disabled during an active conversation
        </p>
      )}
    </div>
  );
}

interface SixtyDbEmptyStateProps {
  className?: string;
  onOpenSettings?: () => void;
}

/**
 * Empty state for an unconfigured 60db provider.
 */
export function SixtyDbEmptyState({ className, onOpenSettings }: SixtyDbEmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn(
        'flex flex-col items-center justify-center p-8 rounded-xl',
        'bg-zinc-900/50 backdrop-blur-lg border border-zinc-800/50 text-center min-h-[300px]',
        className
      )}
    >
      <div className="flex items-center justify-center w-16 h-16 rounded-full mb-6 bg-violet-500/10 border border-violet-500/20">
        <AlertCircle className="w-8 h-8 text-violet-400" />
      </div>
      <h3 className="font-display text-xl text-zinc-100 mb-2">60db Setup Required</h3>
      <p className="text-zinc-400 mb-4">The 60db voice agent is not configured</p>
      <div className="px-4 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50 mb-4">
        <code className="text-sm text-violet-400/80 font-mono">VITE_SIXTYDB_ENABLED</code>
      </div>
      <p className="text-zinc-500 text-sm max-w-md mb-6">
        Enable the 60db tab, then set SIXTYDB_API_KEY and ANTHROPIC_API_KEY on the backend and a
        VITE_SIXTYDB_VOICE id to start voice conversations.
      </p>
      {onOpenSettings && (
        <button
          onClick={onOpenSettings}
          className={cn(
            'flex items-center gap-2 px-6 py-3 rounded-lg bg-violet-500/10 border border-violet-500/30',
            'text-violet-400 hover:text-violet-300 hover:bg-violet-500/20 transition-all duration-200',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50'
          )}
        >
          <Settings className="w-4 h-4" />
          <span className="text-sm font-medium">Open Settings</span>
        </button>
      )}
    </motion.div>
  );
}

export default SixtyDbProvider;
