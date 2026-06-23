import * as Tabs from '@radix-ui/react-tabs';
import { motion, type Variants } from 'framer-motion';
import {
  AudioLines,
  AudioWaveform,
  Bot,
  Headphones,
  Languages,
  Mic,
  PhoneCall,
  Sparkle,
  Sparkles,
  Volume2,
} from 'lucide-react';
import type { ProviderType } from '@/types';
import { cn } from '@/lib/utils';

/**
 * Animation variants for tab state transitions
 * Respects prefers-reduced-motion via useReducedMotion hook integration
 */
// eslint-disable-next-line react-refresh/only-export-components
export const tabVariants: Variants = {
  inactive: {
    scale: 1,
    opacity: 1,
  },
  active: {
    scale: 1,
    opacity: 1,
  },
  hover: {
    scale: 1.02,
    transition: { duration: 0.15, ease: 'easeOut' },
  },
  tap: {
    scale: 0.98,
    transition: { duration: 0.1, ease: 'easeOut' },
  },
};

/**
 * Animation variants for the active tab indicator
 */
// eslint-disable-next-line react-refresh/only-export-components
export const indicatorVariants: Variants = {
  hidden: {
    opacity: 0,
    scaleX: 0,
  },
  visible: {
    opacity: 1,
    scaleX: 1,
    transition: { duration: 0.2, ease: 'easeOut' },
  },
};

/**
 * Icon mapping for provider types
 */
const PROVIDER_ICONS: Record<ProviderType, React.ComponentType<{ className?: string }>> = {
  elevenlabs: AudioLines,
  'elevenlabs-sdk': Mic,
  sixtydb: Volume2,
  xai: Bot,
  openai: Sparkles,
  'openai-translation': Languages,
  ultravox: AudioWaveform,
  vapi: PhoneCall,
  retell: Headphones,
  gemini: Sparkle,
};

/**
 * Short labels for mobile view
 */
const MOBILE_LABELS: Record<ProviderType, string> = {
  elevenlabs: 'Widget',
  'elevenlabs-sdk': 'SDK',
  xai: 'xAI',
  openai: 'OpenAI',
  'openai-translation': 'Translate',
  ultravox: 'Ultravox',
  vapi: 'Vapi',
  retell: 'Retell',
  gemini: 'Gemini',
};

interface ProviderTabProps {
  /** The provider type this tab represents */
  provider: ProviderType;
  /** Display label for the tab */
  label: string;
  /** Whether the tab is disabled (provider unavailable) */
  disabled?: boolean;
  /** Tooltip text when disabled */
  disabledReason?: string;
}

interface ProviderTabInternalProps extends ProviderTabProps {
  /** Whether this tab is currently active */
  isActive?: boolean;
  /** Whether to use reduced motion */
  reduceMotion?: boolean;
}

/**
 * Individual tab component for provider selection
 * Features glassmorphism styling with distinct states:
 * - default: subtle background
 * - hover: increased opacity with scale animation
 * - active: highlighted with accent color
 * - disabled: muted appearance, non-interactive
 *
 * ARIA: Uses Radix UI Tabs which provides proper tablist/tab roles
 */
export function ProviderTab({
  provider,
  label,
  disabled = false,
  disabledReason,
  isActive,
  reduceMotion = false,
}: ProviderTabInternalProps) {
  const Icon = PROVIDER_ICONS[provider];
  const mobileLabel = MOBILE_LABELS[provider];

  // Motion props - disabled when reduced motion is preferred
  const motionProps =
    reduceMotion || disabled
      ? {}
      : {
          whileHover: 'hover' as const,
          whileTap: 'tap' as const,
          variants: tabVariants,
        };

  return (
    <motion.div {...motionProps} className="relative flex-shrink-0">
      <Tabs.Trigger
        value={provider}
        disabled={disabled}
        title={disabled ? disabledReason : label}
        aria-label={label}
        data-testid={`provider-tab-${provider}`}
        className={cn(
          // Base styles - min 44px touch target, mobile-first compact sizing
          'group relative flex items-center justify-center gap-1.5 sm:gap-2',
          'px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg',
          'text-xs sm:text-sm font-medium transition-all duration-200',
          'min-h-[44px] min-w-[44px]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50',
          'focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900',

          // Default state - glassmorphism
          'bg-white/5 backdrop-blur-sm border border-white/10',
          'text-zinc-400',

          // Hover state (when not disabled)
          !disabled && ['hover:bg-white/10 hover:border-white/20', 'hover:text-zinc-200'],

          // Active/selected state
          'data-[state=active]:bg-gradient-to-br data-[state=active]:from-amber-500/15 data-[state=active]:to-orange-500/10',
          'data-[state=active]:border-amber-500/40',
          'data-[state=active]:text-amber-400',
          'data-[state=active]:shadow-[0_0_24px_rgba(245,158,11,0.15)]',

          // Disabled state
          disabled && [
            'opacity-50 cursor-not-allowed',
            'hover:bg-white/5 hover:border-white/10 hover:text-zinc-400',
          ]
        )}
      >
        {/* Icon */}
        <Icon
          className={cn(
            'w-4 h-4 sm:w-[18px] sm:h-[18px] transition-colors duration-200 flex-shrink-0',
            'group-data-[state=active]:text-amber-400'
          )}
          aria-hidden="true"
        />

        {/* Label - Short on mobile, full on larger screens */}
        <span className="whitespace-nowrap">
          <span className="sm:hidden">{mobileLabel}</span>
          <span className="hidden sm:inline">{label}</span>
        </span>

        {/* Active indicator - animated with Framer Motion */}
        <motion.span
          variants={indicatorVariants}
          initial="hidden"
          animate={isActive ? 'visible' : 'hidden'}
          className={cn(
            'absolute bottom-0 left-1/2 -translate-x-1/2 w-6 sm:w-8 h-0.5 rounded-full',
            'bg-gradient-to-r from-amber-500 to-orange-500'
          )}
        />
      </Tabs.Trigger>
    </motion.div>
  );
}
