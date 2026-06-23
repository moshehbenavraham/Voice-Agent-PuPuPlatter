/**
 * useSixtyDbVoice Hook
 *
 * Thin, type-safe accessor for SixtyDbVoiceContext. Must be used within a
 * SixtyDbVoiceProvider.
 *
 * @see src/contexts/SixtyDbVoiceContext.tsx
 * @see src/types/sixtydb.ts
 */

import { useContext } from 'react';
import { SixtyDbVoiceContext } from '@/contexts/SixtyDbVoiceContext';
import type { SixtyDbVoiceHookReturn } from '@/types/sixtydb';

export function useSixtyDbVoice(): SixtyDbVoiceHookReturn {
  const context = useContext(SixtyDbVoiceContext);

  if (!context) {
    throw new Error('useSixtyDbVoice must be used within a SixtyDbVoiceProvider');
  }

  return context;
}

export default useSixtyDbVoice;
