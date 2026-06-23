import { useSixtyDbVoice } from '@/hooks/useSixtyDbVoice';
import { ConversationPanel } from './ConversationPanel';

interface SixtyDbConversationPanelProps {
  className?: string;
}

/**
 * Conversation panel wrapper for the 60db provider.
 * Messages are already in VoiceMessage format; activeTranscript is the partial
 * assistant reply currently being spoken.
 */
export function SixtyDbConversationPanel({ className }: SixtyDbConversationPanelProps) {
  const { messages, activeTranscript } = useSixtyDbVoice();

  return (
    <ConversationPanel
      messages={messages}
      className={className}
      activeTranscript={activeTranscript || null}
      activeTranscriptRole="assistant"
    />
  );
}
