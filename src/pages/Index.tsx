import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, AlertCircle, X } from 'lucide-react';
import { HeroSection } from '@/components/HeroSection';
import { VoiceButton } from '@/components/voice/VoiceButton';
import { VoiceStatus } from '@/components/voice/VoiceStatus';
import { VoiceVisualizer } from '@/components/voice/VoiceVisualizer';
import { VoiceWidget } from '@/components/voice/VoiceWidget';
import { BackgroundEffects } from '@/components/BackgroundEffects';
import { ConfigurationDialog } from '@/components/settings';
import { ProviderTabs } from '@/components/tabs';
import {
  ElevenLabsConversationPanel,
  XAIConversationPanel,
  OpenAIConversationPanel,
  UltravoxConversationPanel,
  VapiConversationPanel,
  RetellConversationPanel,
  GeminiConversationPanel,
  SixtyDbConversationPanel,
} from '@/components/conversation';
import {
  XAIProvider,
  XAIVoiceButton,
  XAIVoiceSelector,
  XAIVoiceStatus,
  XAIVoiceVisualizer,
  OpenAIProvider,
  OpenAIVoiceButton,
  OpenAIVoiceSelector,
  OpenAIVoiceStatus,
  OpenAIVoiceVisualizer,
  OpenAITranslationProvider,
  UltravoxProvider,
  UltravoxVoiceButton,
  UltravoxVoiceStatus,
  VapiProvider,
  VapiButton,
  VapiVoiceStatus,
  RetellProvider,
  RetellButton,
  RetellVoiceStatus,
  GeminiProvider,
  GeminiButton,
  GeminiVoiceStatus,
  GeminiVoiceSelector,
  SixtyDbProvider,
  SixtyDbButton,
  SixtyDbVoiceStatus,
  SixtyDbVoiceSelector,
} from '@/components/providers';
import { useVoice } from '@/contexts/VoiceContext';
import { useProvider } from '@/contexts/ProviderContext';
import { toast } from '@/hooks/use-toast';
import { useOpenAIVoice } from '@/hooks/useOpenAIVoice';
import { useXAIVoice } from '@/hooks/useXAIVoice';
import { hasConfiguredValue, isPlaceholderConfigValue } from '@/lib/configPlaceholders';
import { trackError } from '@/lib/errorTracking';
import type { ProviderType } from '@/types';
import type { OpenAITranslationSessionEndReason } from '@/types/openai-translation';

const DEBUG = import.meta.env.DEV;

function debugLog(context: string, message: string, data?: unknown) {
  if (DEBUG) {
    console.log(`[Index:${context}]`, message, data ?? '');
  }
}

function EndConversationButton({ onClick }: { onClick: () => Promise<void> | void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-6 py-3 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-500/30 transition-all duration-200"
    >
      <X className="w-4 h-4" />
      <span className="text-sm">End conversation</span>
    </button>
  );
}

function OpenAIEndConversationButton() {
  const { disconnect } = useOpenAIVoice();
  return <EndConversationButton onClick={disconnect} />;
}

function XAIEndConversationButton() {
  const { disconnect } = useXAIVoice();
  return <EndConversationButton onClick={disconnect} />;
}

export const Index = () => {
  const { error, clearError, isLoading, connect, disconnect, isConnected } = useVoice();
  const { activeProvider } = useProvider();
  const [showConfig, setShowConfig] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [xaiHasStarted, setXaiHasStarted] = useState(false);
  const [openaiHasStarted, setOpenaiHasStarted] = useState(false);
  const [ultravoxHasStarted, setUltravoxHasStarted] = useState(false);
  const [vapiHasStarted, setVapiHasStarted] = useState(false);
  const [retellHasStarted, setRetellHasStarted] = useState(false);
  const [geminiHasStarted, setGeminiHasStarted] = useState(false);
  const [sixtydbHasStarted, setSixtydbHasStarted] = useState(false);
  const [openaiTranslationIsOffline, setOpenaiTranslationIsOffline] = useState(() => {
    return typeof navigator !== 'undefined' ? !navigator.onLine : false;
  });

  // Refs to expose provider disconnect functions for clean provider switching
  const geminiDisconnectRef = useRef<(() => Promise<void>) | null>(null);
  const sixtydbDisconnectRef = useRef<(() => Promise<void>) | null>(null);
  const openaiTranslationStopRef = useRef<
    ((reason?: OpenAITranslationSessionEndReason) => Promise<void>) | null
  >(null);

  // Handle provider change - disconnect active connection before switching
  const handleProviderChange = useCallback(
    async (newProvider: ProviderType) => {
      if (newProvider === activeProvider) {
        return;
      }

      debugLog('handleProviderChange', 'Switching provider', {
        from: activeProvider,
        to: newProvider,
      });

      // Disconnect ElevenLabs SDK if active
      if (isConnected && activeProvider === 'elevenlabs-sdk') {
        debugLog('handleProviderChange', 'Disconnecting ElevenLabs SDK before switch');
        await disconnect();
        setHasStarted(false);
      }

      // Disconnect xAI if active
      if (xaiHasStarted && activeProvider === 'xai') {
        debugLog('handleProviderChange', 'Disconnecting xAI before switch');
        setXaiHasStarted(false);
      }

      // Disconnect OpenAI if active
      if (openaiHasStarted && activeProvider === 'openai') {
        debugLog('handleProviderChange', 'Disconnecting OpenAI before switch');
        setOpenaiHasStarted(false);
      }

      // Stop OpenAI Translation if active
      if (activeProvider === 'openai-translation') {
        debugLog('handleProviderChange', 'Cleaning up OpenAI Translation before switch');
        if (openaiTranslationStopRef.current) {
          await openaiTranslationStopRef.current('provider-switch');
        }
      }

      // Disconnect Ultravox if active
      if (ultravoxHasStarted && activeProvider === 'ultravox') {
        debugLog('handleProviderChange', 'Disconnecting Ultravox before switch');
        setUltravoxHasStarted(false);
      }

      // Disconnect Vapi if active
      if (vapiHasStarted && activeProvider === 'vapi') {
        debugLog('handleProviderChange', 'Disconnecting Vapi before switch');
        setVapiHasStarted(false);
      }

      // Disconnect Retell if active
      if (retellHasStarted && activeProvider === 'retell') {
        debugLog('handleProviderChange', 'Disconnecting Retell before switch');
        setRetellHasStarted(false);
      }

      // Disconnect Gemini if active - must call actual disconnect to clean up AudioContext
      if (geminiHasStarted && activeProvider === 'gemini') {
        debugLog('handleProviderChange', 'Disconnecting Gemini before switch');
        if (geminiDisconnectRef.current) {
          await geminiDisconnectRef.current();
        }
        setGeminiHasStarted(false);
      }

      // Disconnect 60db if active - must call actual disconnect to release mic/AudioContext
      if (sixtydbHasStarted && activeProvider === 'sixtydb') {
        debugLog('handleProviderChange', 'Disconnecting 60db before switch');
        if (sixtydbDisconnectRef.current) {
          await sixtydbDisconnectRef.current();
        }
        setSixtydbHasStarted(false);
      }

      toast({
        title: 'Provider Changed',
        description: `Switched to ${newProvider}`,
      });
    },
    [
      activeProvider,
      isConnected,
      disconnect,
      xaiHasStarted,
      openaiHasStarted,
      ultravoxHasStarted,
      vapiHasStarted,
      retellHasStarted,
      geminiHasStarted,
      sixtydbHasStarted,
    ]
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return undefined;
    }

    const updateTranslationNetworkState = () => {
      setOpenaiTranslationIsOffline(!navigator.onLine);
    };

    updateTranslationNetworkState();
    window.addEventListener('online', updateTranslationNetworkState);
    window.addEventListener('offline', updateTranslationNetworkState);

    return () => {
      window.removeEventListener('online', updateTranslationNetworkState);
      window.removeEventListener('offline', updateTranslationNetworkState);
    };
  }, []);

  // Handle xAI disconnect
  const handleXAIDisconnect = useCallback(() => {
    setXaiHasStarted(false);
    toast({
      title: 'Disconnected',
      description: 'xAI voice conversation ended',
    });
  }, []);

  // Handle xAI connect
  const handleXAIConnect = useCallback(() => {
    setXaiHasStarted(true);
    toast({
      title: 'Connected',
      description: 'xAI voice conversation is now active',
    });
  }, []);

  // Handle OpenAI disconnect
  const handleOpenAIDisconnect = useCallback(() => {
    setOpenaiHasStarted(false);
    toast({
      title: 'Disconnected',
      description: 'OpenAI voice conversation ended',
    });
  }, []);

  // Handle OpenAI connect
  const handleOpenAIConnect = useCallback(() => {
    setOpenaiHasStarted(true);
    toast({
      title: 'Connected',
      description: 'OpenAI voice conversation is now active',
    });
  }, []);

  // Handle Ultravox disconnect
  const handleUltravoxDisconnect = useCallback(() => {
    setUltravoxHasStarted(false);
    toast({
      title: 'Disconnected',
      description: 'Ultravox voice conversation ended',
    });
  }, []);

  // Handle Ultravox connect
  const handleUltravoxConnect = useCallback(() => {
    setUltravoxHasStarted(true);
    toast({
      title: 'Connected',
      description: 'Ultravox voice conversation is now active',
    });
  }, []);

  // Handle Vapi disconnect
  const handleVapiDisconnect = useCallback(() => {
    setVapiHasStarted(false);
    toast({
      title: 'Disconnected',
      description: 'Vapi voice conversation ended',
    });
  }, []);

  // Handle Vapi connect
  const handleVapiConnect = useCallback(() => {
    setVapiHasStarted(true);
    toast({
      title: 'Connected',
      description: 'Vapi voice conversation is now active',
    });
  }, []);

  // Handle Retell disconnect
  const handleRetellDisconnect = useCallback(() => {
    setRetellHasStarted(false);
    toast({
      title: 'Disconnected',
      description: 'Retell voice conversation ended',
    });
  }, []);

  // Handle Retell connect
  const handleRetellConnect = useCallback(() => {
    setRetellHasStarted(true);
    toast({
      title: 'Connected',
      description: 'Retell voice conversation is now active',
    });
  }, []);

  // Handle Gemini disconnect
  const handleGeminiDisconnect = useCallback(() => {
    setGeminiHasStarted(false);
    toast({
      title: 'Disconnected',
      description: 'Gemini voice conversation ended',
    });
  }, []);

  // Handle Gemini connect
  const handleGeminiConnect = useCallback(() => {
    setGeminiHasStarted(true);
    toast({
      title: 'Connected',
      description: 'Gemini voice conversation is now active',
    });
  }, []);

  // Handle 60db disconnect
  const handleSixtyDbDisconnect = useCallback(() => {
    setSixtydbHasStarted(false);
    toast({
      title: 'Disconnected',
      description: '60db voice conversation ended',
    });
  }, []);

  // Handle 60db connect
  const handleSixtyDbConnect = useCallback(() => {
    setSixtydbHasStarted(true);
    toast({
      title: 'Connected',
      description: '60db voice conversation is now active',
    });
  }, []);

  // Check if the active ElevenLabs provider is configured
  useEffect(() => {
    const shouldPromptForElevenLabs =
      activeProvider === 'elevenlabs' || activeProvider === 'elevenlabs-sdk';
    const agentId = import.meta.env.VITE_ELEVENLABS_AGENT_ID;
    debugLog('mount', 'Checking configuration', {
      activeProvider,
      hasAgentId: !!agentId,
      isPlaceholder: isPlaceholderConfigValue(agentId),
      agentIdPreview: agentId ? agentId.substring(0, 8) + '...' : 'not set',
    });

    if (shouldPromptForElevenLabs && !hasConfiguredValue(agentId)) {
      debugLog('mount', 'Agent ID not configured');
    }
  }, [activeProvider]);

  // Handle connection success
  const handleConnect = () => {
    setHasStarted(true);
    toast({
      title: 'Connected',
      description: 'Voice conversation is now active',
    });
  };

  // Handle disconnection
  const handleDisconnect = () => {
    toast({
      title: 'Disconnected',
      description: 'Voice conversation ended',
    });
  };

  // Handle configuration errors
  const handleConfigError = () => {
    toast({
      title: 'Configuration Required',
      description: 'Please set your ElevenLabs Agent ID',
      variant: 'destructive',
    });
    setShowConfig(true);
  };

  // Handle HeroSection start conversation
  const handleStartConversation = async () => {
    debugLog('handleStartConversation', 'Starting conversation...', { isConfigured });

    if (!isConfigured) {
      debugLog('handleStartConversation', 'Not configured, showing config modal');
      handleConfigError();
      return;
    }

    try {
      const agentId = import.meta.env.VITE_ELEVENLABS_AGENT_ID;
      debugLog('handleStartConversation', 'Connecting with agent', {
        agentId: agentId?.substring(0, 8) + '...',
      });

      await connect(agentId);
      debugLog('handleStartConversation', 'Connection successful');
      handleConnect();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      debugLog('handleStartConversation', 'Connection failed', { error: err });
      trackError('Index', 'Failed to start conversation', err);

      toast({
        title: 'Connection Failed',
        description: errorMessage || 'Please check your configuration',
        variant: 'destructive',
      });
    }
  };

  // Handle end call
  const handleEndCall = async () => {
    await disconnect();
    setHasStarted(false);
    handleDisconnect();
  };

  // Check for missing configuration
  const agentId = import.meta.env.VITE_ELEVENLABS_AGENT_ID;
  const isConfigured = hasConfiguredValue(agentId);

  // Main render
  return (
    <div className="min-h-screen bg-[#09090b] relative overflow-hidden film-grain">
      {/* Background Effects */}
      <BackgroundEffects />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          {/* Logo / Brand */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            {/* Logo mark */}
            <div className="relative w-8 h-8 flex items-center justify-center">
              <div className="absolute inset-0 rounded-lg bg-amber-500/10 border border-amber-500/20" />
              <motion.div
                className="w-2 h-2 rounded-full bg-amber-400"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.8, 1, 0.8],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
            </div>
            <span className="font-display text-lg text-zinc-200 tracking-tight">
              Voice<span className="text-amber-400">AI</span>
            </span>
          </motion.div>

          {/* Right side */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-4"
          >
            {/* Config status */}
            {!isConfigured && (
              <div className="flex items-center gap-2 text-amber-400/70 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span className="hidden sm:inline">Setup required</span>
              </div>
            )}

            {/* Settings button */}
            <button
              onClick={() => setShowConfig(true)}
              className="p-2 rounded-lg bg-zinc-900/50 border border-zinc-800/50 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-all duration-200"
              aria-label="Open settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </motion.div>
        </div>
      </header>

      {/* Provider Tabs - Below header */}
      <div className="fixed top-20 left-0 right-0 z-40 px-6">
        <div className="max-w-md mx-auto">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            <ProviderTabs onProviderChange={handleProviderChange} />
          </motion.div>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative z-10 min-h-screen pt-12">
        <AnimatePresence mode="wait">
          {/* ElevenLabs Widget Provider */}
          {activeProvider === 'elevenlabs' && (
            <motion.div
              key="widget-elevenlabs"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5 }}
              className="min-h-screen flex flex-col items-center justify-center px-6"
            >
              <div className="text-center mb-12">
                <h1 className="font-display text-5xl sm:text-6xl text-zinc-100 mb-4">
                  Voice<span className="text-gradient">AI</span>
                </h1>
                <p className="text-zinc-400 text-lg max-w-md mx-auto">
                  Click the orb below to start a conversation
                </p>
              </div>

              {/* ElevenLabs Widget - positioned center */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
              >
                <VoiceWidget className="relative z-20" />
              </motion.div>
            </motion.div>
          )}

          {/* ElevenLabs SDK Provider */}
          {activeProvider === 'elevenlabs-sdk' && !hasStarted && (
            <HeroSection
              key="hero-elevenlabs-sdk"
              onStartConversation={handleStartConversation}
              isLoading={isLoading}
              error={error}
            />
          )}

          {activeProvider === 'elevenlabs-sdk' && hasStarted && (
            <motion.div
              key="interface-elevenlabs-sdk"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="min-h-screen flex flex-col"
            >
              <div className="flex-1 flex flex-col items-center justify-center px-6 py-24">
                <div className="w-full max-w-lg space-y-12">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="text-center"
                  >
                    <h2 className="font-display text-3xl sm:text-4xl text-zinc-100 mb-2">
                      Conversation Active
                    </h2>
                    <p className="text-zinc-500 text-sm">Speak naturally - AI is listening</p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
                    className="flex justify-center py-8"
                  >
                    <VoiceButton size="lg" onDisconnect={handleEndCall} />
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <VoiceVisualizer className="w-full" />
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    <VoiceStatus />
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.55 }}
                  >
                    <ElevenLabsConversationPanel className="w-full h-64" />
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="flex justify-center pt-4"
                  >
                    <button
                      onClick={handleEndCall}
                      className="flex items-center gap-2 px-6 py-3 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-500/30 transition-all duration-200"
                    >
                      <X className="w-4 h-4" />
                      <span className="text-sm">End conversation</span>
                    </button>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          )}

          {/* xAI Provider */}
          {activeProvider === 'xai' && (
            <XAIProvider onDisconnect={handleXAIDisconnect}>
              {!xaiHasStarted ? (
                <motion.div
                  key="hero-xai"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5 }}
                  className="min-h-screen flex flex-col items-center justify-center px-6"
                >
                  <div className="text-center space-y-8">
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <h1 className="font-display text-5xl sm:text-6xl text-zinc-100 mb-4">
                        Talk to <span className="text-sky-400">Grok</span>
                      </h1>
                      <p className="text-zinc-400 text-lg max-w-md mx-auto">
                        Experience voice conversations powered by xAI
                      </p>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
                      className="w-full max-w-md mx-auto"
                    >
                      <XAIVoiceSelector />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.45, type: 'spring', stiffness: 200 }}
                      className="py-8"
                    >
                      <XAIVoiceButton size="lg" onConnect={handleXAIConnect} />
                    </motion.div>

                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6 }}
                      className="text-zinc-500 text-sm"
                    >
                      Click to start your conversation with Grok
                    </motion.p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="interface-xai"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="min-h-screen flex flex-col"
                >
                  <div className="flex-1 flex flex-col items-center justify-center px-6 py-24">
                    <div className="w-full max-w-lg space-y-12">
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-center"
                      >
                        <h2 className="font-display text-3xl sm:text-4xl text-zinc-100 mb-2">
                          Grok is Listening
                        </h2>
                        <p className="text-zinc-500 text-sm">Speak naturally - xAI is processing</p>
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25 }}
                      >
                        <XAIVoiceSelector />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
                        className="flex justify-center py-8"
                      >
                        <XAIVoiceButton size="lg" onDisconnect={handleXAIDisconnect} />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                      >
                        <XAIVoiceVisualizer className="w-full" />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                      >
                        <XAIVoiceStatus />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.55 }}
                      >
                        <XAIConversationPanel className="w-full h-64" />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="flex justify-center pt-4"
                      >
                        <XAIEndConversationButton />
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              )}
            </XAIProvider>
          )}

          {/* OpenAI Provider */}
          {activeProvider === 'openai' && (
            <OpenAIProvider onDisconnect={handleOpenAIDisconnect}>
              {!openaiHasStarted ? (
                <motion.div
                  key="hero-openai"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5 }}
                  className="min-h-screen flex flex-col items-center justify-center px-6"
                >
                  <div className="text-center space-y-8">
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <h1 className="font-display text-5xl sm:text-6xl text-zinc-100 mb-4">
                        Talk to <span className="text-violet-400">GPT-4o</span>
                      </h1>
                      <p className="text-zinc-400 text-lg max-w-md mx-auto">
                        Experience voice conversations powered by OpenAI
                      </p>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
                      className="w-full max-w-md mx-auto"
                    >
                      <OpenAIVoiceSelector />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.45, type: 'spring', stiffness: 200 }}
                      className="py-8"
                    >
                      <OpenAIVoiceButton size="lg" onConnect={handleOpenAIConnect} />
                    </motion.div>

                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6 }}
                      className="text-zinc-500 text-sm"
                    >
                      Click to start your conversation with GPT-4o
                    </motion.p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="interface-openai"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="min-h-screen flex flex-col"
                >
                  <div className="flex-1 flex flex-col items-center justify-center px-6 py-24">
                    <div className="w-full max-w-lg space-y-12">
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-center"
                      >
                        <h2 className="font-display text-3xl sm:text-4xl text-zinc-100 mb-2">
                          GPT-4o is Listening
                        </h2>
                        <p className="text-zinc-500 text-sm">
                          Speak naturally - OpenAI is processing
                        </p>
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25 }}
                      >
                        <OpenAIVoiceSelector />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
                        className="flex justify-center py-8"
                      >
                        <OpenAIVoiceButton size="lg" onDisconnect={handleOpenAIDisconnect} />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                      >
                        <OpenAIVoiceVisualizer className="w-full" />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                      >
                        <OpenAIVoiceStatus />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.55 }}
                      >
                        <OpenAIConversationPanel className="w-full h-64" />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="flex justify-center pt-4"
                      >
                        <OpenAIEndConversationButton />
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              )}
            </OpenAIProvider>
          )}

          {/* OpenAI Translation Provider */}
          {activeProvider === 'openai-translation' && (
            <OpenAITranslationProvider
              isOffline={openaiTranslationIsOffline}
              stopRef={openaiTranslationStopRef}
            />
          )}

          {/* Ultravox Provider */}
          {activeProvider === 'ultravox' && (
            <UltravoxProvider onDisconnect={handleUltravoxDisconnect}>
              {!ultravoxHasStarted ? (
                <motion.div
                  key="hero-ultravox"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5 }}
                  className="min-h-screen flex flex-col items-center justify-center px-6"
                >
                  <div className="text-center space-y-8">
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <h1 className="font-display text-5xl sm:text-6xl text-zinc-100 mb-4">
                        Talk to <span className="text-teal-400">Ultravox</span>
                      </h1>
                      <p className="text-zinc-400 text-lg max-w-md mx-auto">
                        Experience voice conversations powered by Ultravox AI
                      </p>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
                      className="py-8"
                    >
                      <UltravoxVoiceButton size="lg" onConnect={handleUltravoxConnect} />
                    </motion.div>

                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6 }}
                      className="text-zinc-500 text-sm"
                    >
                      Click to start your conversation with Ultravox
                    </motion.p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="interface-ultravox"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="min-h-screen flex flex-col"
                >
                  <div className="flex-1 flex flex-col items-center justify-center px-6 py-24">
                    <div className="w-full max-w-lg space-y-12">
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-center"
                      >
                        <h2 className="font-display text-3xl sm:text-4xl text-zinc-100 mb-2">
                          Ultravox is Listening
                        </h2>
                        <p className="text-zinc-500 text-sm">
                          Speak naturally - Ultravox is processing
                        </p>
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
                        className="flex justify-center py-8"
                      >
                        <UltravoxVoiceButton size="lg" onDisconnect={handleUltravoxDisconnect} />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                      >
                        <UltravoxVoiceStatus />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.55 }}
                      >
                        <UltravoxConversationPanel className="w-full h-64" />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="flex justify-center pt-4"
                      >
                        <button
                          onClick={handleUltravoxDisconnect}
                          className="flex items-center gap-2 px-6 py-3 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-500/30 transition-all duration-200"
                        >
                          <X className="w-4 h-4" />
                          <span className="text-sm">End conversation</span>
                        </button>
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              )}
            </UltravoxProvider>
          )}

          {/* Vapi Provider */}
          {activeProvider === 'vapi' && (
            <VapiProvider onDisconnect={handleVapiDisconnect}>
              {!vapiHasStarted ? (
                <motion.div
                  key="hero-vapi"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5 }}
                  className="min-h-screen flex flex-col items-center justify-center px-6"
                >
                  <div className="text-center space-y-8">
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <h1 className="font-display text-5xl sm:text-6xl text-zinc-100 mb-4">
                        Talk to <span className="text-violet-400">Vapi</span>
                      </h1>
                      <p className="text-zinc-400 text-lg max-w-md mx-auto">
                        Experience voice conversations powered by Vapi
                      </p>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
                      className="py-8"
                    >
                      <VapiButton size="lg" onConnect={handleVapiConnect} />
                    </motion.div>

                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6 }}
                      className="text-zinc-500 text-sm"
                    >
                      Click to start your conversation with Vapi
                    </motion.p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="interface-vapi"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="min-h-screen flex flex-col"
                >
                  <div className="flex-1 flex flex-col items-center justify-center px-6 py-24">
                    <div className="w-full max-w-lg space-y-12">
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-center"
                      >
                        <h2 className="font-display text-3xl sm:text-4xl text-zinc-100 mb-2">
                          Vapi is Listening
                        </h2>
                        <p className="text-zinc-500 text-sm">
                          Speak naturally - Vapi is processing
                        </p>
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
                        className="flex justify-center py-8"
                      >
                        <VapiButton size="lg" onDisconnect={handleVapiDisconnect} />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                      >
                        <VapiVoiceStatus />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.55 }}
                      >
                        <VapiConversationPanel className="w-full h-64" />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="flex justify-center pt-4"
                      >
                        <button
                          onClick={handleVapiDisconnect}
                          className="flex items-center gap-2 px-6 py-3 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-500/30 transition-all duration-200"
                        >
                          <X className="w-4 h-4" />
                          <span className="text-sm">End conversation</span>
                        </button>
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              )}
            </VapiProvider>
          )}

          {/* Retell Provider */}
          {activeProvider === 'retell' && (
            <RetellProvider onDisconnect={handleRetellDisconnect}>
              {!retellHasStarted ? (
                <motion.div
                  key="hero-retell"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5 }}
                  className="min-h-screen flex flex-col items-center justify-center px-6"
                >
                  <div className="text-center space-y-8">
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <h1 className="font-display text-5xl sm:text-6xl text-zinc-100 mb-4">
                        Talk to <span className="text-teal-400">Retell</span>
                      </h1>
                      <p className="text-zinc-400 text-lg max-w-md mx-auto">
                        Experience voice conversations powered by Retell AI
                      </p>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
                      className="py-8"
                    >
                      <RetellButton size="lg" onConnect={handleRetellConnect} />
                    </motion.div>

                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6 }}
                      className="text-zinc-500 text-sm"
                    >
                      Click to start your conversation with Retell
                    </motion.p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="interface-retell"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="min-h-screen flex flex-col"
                >
                  <div className="flex-1 flex flex-col items-center justify-center px-6 py-24">
                    <div className="w-full max-w-lg space-y-12">
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-center"
                      >
                        <h2 className="font-display text-3xl sm:text-4xl text-zinc-100 mb-2">
                          Retell is Listening
                        </h2>
                        <p className="text-zinc-500 text-sm">
                          Speak naturally - Retell is processing
                        </p>
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
                        className="flex justify-center py-8"
                      >
                        <RetellButton size="lg" onDisconnect={handleRetellDisconnect} />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                      >
                        <RetellVoiceStatus />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.55 }}
                      >
                        <RetellConversationPanel className="w-full h-64" />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="flex justify-center pt-4"
                      >
                        <button
                          onClick={handleRetellDisconnect}
                          className="flex items-center gap-2 px-6 py-3 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-500/30 transition-all duration-200"
                        >
                          <X className="w-4 h-4" />
                          <span className="text-sm">End conversation</span>
                        </button>
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              )}
            </RetellProvider>
          )}

          {/* Gemini Provider */}
          {activeProvider === 'gemini' && (
            <GeminiProvider
              onDisconnect={handleGeminiDisconnect}
              disconnectRef={geminiDisconnectRef}
            >
              {!geminiHasStarted ? (
                <motion.div
                  key="hero-gemini"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5 }}
                  className="min-h-screen flex flex-col items-center justify-center px-6"
                >
                  <div className="text-center space-y-8">
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <h1 className="font-display text-5xl sm:text-6xl text-zinc-100 mb-4">
                        Talk to <span className="text-emerald-400">Gemini</span>
                      </h1>
                      <p className="text-zinc-400 text-lg max-w-md mx-auto">
                        Experience voice conversations powered by Google Gemini Live
                      </p>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3 }}
                      className="max-w-xs mx-auto"
                    >
                      <GeminiVoiceSelector />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
                      className="py-8"
                    >
                      <GeminiButton size="lg" onConnect={handleGeminiConnect} />
                    </motion.div>

                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6 }}
                      className="text-zinc-500 text-sm"
                    >
                      Click to start your conversation with Gemini
                    </motion.p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="interface-gemini"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="min-h-screen flex flex-col"
                >
                  <div className="flex-1 flex flex-col items-center justify-center px-6 py-24">
                    <div className="w-full max-w-lg space-y-12">
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-center"
                      >
                        <h2 className="font-display text-3xl sm:text-4xl text-zinc-100 mb-2">
                          Gemini is Listening
                        </h2>
                        <p className="text-zinc-500 text-sm">
                          Speak naturally - Gemini is processing
                        </p>
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
                        className="flex justify-center py-8"
                      >
                        <GeminiButton size="lg" onDisconnect={handleGeminiDisconnect} />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                      >
                        <GeminiVoiceStatus />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.55 }}
                      >
                        <GeminiConversationPanel className="w-full h-64" />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="flex justify-center pt-4"
                      >
                        <button
                          onClick={handleGeminiDisconnect}
                          className="flex items-center gap-2 px-6 py-3 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-500/30 transition-all duration-200"
                        >
                          <X className="w-4 h-4" />
                          <span className="text-sm">End conversation</span>
                        </button>
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              )}
            </GeminiProvider>
          )}

          {/* 60db Provider */}
          {activeProvider === 'sixtydb' && (
            <SixtyDbProvider
              onDisconnect={handleSixtyDbDisconnect}
              disconnectRef={sixtydbDisconnectRef}
            >
              {!sixtydbHasStarted ? (
                <motion.div
                  key="hero-sixtydb"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5 }}
                  className="min-h-screen flex flex-col items-center justify-center px-6"
                >
                  <div className="text-center space-y-8">
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <h1 className="font-display text-5xl sm:text-6xl text-zinc-100 mb-4">
                        Talk to <span className="text-violet-400">60db</span>
                      </h1>
                      <p className="text-zinc-400 text-lg max-w-md mx-auto">
                        Voice conversations powered by 60db speech with a Claude brain
                      </p>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.3 }}
                      className="max-w-xs mx-auto"
                    >
                      <SixtyDbVoiceSelector />
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
                      className="py-8"
                    >
                      <SixtyDbButton size="lg" onConnect={handleSixtyDbConnect} />
                    </motion.div>

                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.6 }}
                      className="text-zinc-500 text-sm"
                    >
                      Click to start your conversation
                    </motion.p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="interface-sixtydb"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="min-h-screen flex flex-col"
                >
                  <div className="flex-1 flex flex-col items-center justify-center px-6 py-24">
                    <div className="w-full max-w-lg space-y-12">
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-center"
                      >
                        <h2 className="font-display text-3xl sm:text-4xl text-zinc-100 mb-2">
                          60db is Listening
                        </h2>
                        <p className="text-zinc-500 text-sm">Speak naturally - just talk</p>
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
                        className="flex justify-center py-8"
                      >
                        <SixtyDbButton size="lg" onDisconnect={handleSixtyDbDisconnect} />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                      >
                        <SixtyDbVoiceStatus />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.55 }}
                      >
                        <SixtyDbConversationPanel className="w-full h-64" />
                      </motion.div>

                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="flex justify-center pt-4"
                      >
                        <button
                          onClick={handleSixtyDbDisconnect}
                          className="flex items-center gap-2 px-6 py-3 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-400 hover:border-red-500/30 transition-all duration-200"
                        >
                          <X className="w-4 h-4" />
                          <span className="text-sm">End conversation</span>
                        </button>
                      </motion.div>
                    </div>
                  </div>
                </motion.div>
              )}
            </SixtyDbProvider>
          )}
        </AnimatePresence>
      </main>

      {/* Configuration Dialog */}
      <ConfigurationDialog
        isOpen={showConfig}
        onClose={() => setShowConfig(false)}
        elevenLabsStatus={isConnected ? 'connected' : 'disconnected'}
        openAIStatus={openaiHasStarted ? 'connected' : 'disconnected'}
        xaiStatus={xaiHasStarted ? 'connected' : 'disconnected'}
      />

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20, x: 20 }}
            animate={{ opacity: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, y: 20, x: 20 }}
            className="fixed bottom-6 right-6 z-50 max-w-sm"
          >
            <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-red-300 font-medium text-sm">Connection Error</p>
                  <p className="text-red-300/70 text-sm mt-1 break-words">{error}</p>
                  <button
                    onClick={clearError}
                    className="text-red-400 hover:text-red-300 text-xs mt-2 underline"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer accent line */}
      <div className="fixed bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-zinc-800/50 to-transparent" />
    </div>
  );
};
