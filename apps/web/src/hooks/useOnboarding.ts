import { useMemo, useCallback, useState } from 'react';
import type { UserProvider } from '@chat/sdk';
import { storage } from '../lib/storage';
import {
  IS_NEW_KEY,
  getOnboardingState,
  clearIsNewFlag,
  type OnboardingState,
} from '../lib/onboarding-helpers';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseOnboardingArgs {
  /** Connected providers from useSettings — passed in, NOT fetched here (ADR-2). */
  userProviders: UserProvider[];
  /** Loading state from useSettings. */
  userProvidersLoading: boolean;
  /** Loading state from useModels. */
  modelsLoading: boolean;
}

export interface UseOnboardingReturn {
  onboarding: OnboardingState;
  /** Removes "roundtable:is-new" from storage. Idempotent. */
  clearIsNew: () => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Derives the onboarding persona for the current render.
 *
 * Reads `IS_NEW_KEY` from storage per render (not in useState) so that a
 * `clearIsNew()` call in another component immediately affects the next render
 * cycle without needing a state lift.
 *
 * Does NOT call useSettings() or useModels() — receives their outputs as args
 * to avoid duplicate fetches (ADR-2). ChatPage passes these after its own calls.
 */
export function useOnboarding(args: UseOnboardingArgs): UseOnboardingReturn {
  // We use a tiny counter to force a re-render when clearIsNew is called.
  // This is needed because storage.get() is not reactive on its own.
  const [, forceUpdate] = useState(0);

  const isNewFlag = storage.get(IS_NEW_KEY) === '1';

  const onboarding = useMemo(
    () =>
      getOnboardingState({
        isNewFlag,
        userProviders: args.userProviders,
        userProvidersLoading: args.userProvidersLoading,
        modelsLoading: args.modelsLoading,
      }),
    [isNewFlag, args.userProviders, args.userProvidersLoading, args.modelsLoading]
  );

  const clearIsNew = useCallback(() => {
    clearIsNewFlag();
    // Trigger re-render so the next derived value is computed without the flag.
    forceUpdate((n) => n + 1);
  }, []);

  return { onboarding, clearIsNew };
}
