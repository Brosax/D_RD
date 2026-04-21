import * as React from 'react'
import { useState } from 'react'
import { Text } from '@anthropic/ink'
import { logEvent } from '../../services/analytics/index.js'
import {
  checkCachedPassesEligibility,
  formatCreditAmount,
  getCachedReferrerReward,
  getCachedRemainingPasses,
} from '../../services/api/referral.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'

function resetIfPassesRefreshed(): void {
  const remaining = getCachedRemainingPasses()
  if (remaining == null || remaining <= 0) return
  const config = getGlobalConfig()
  const lastSeen = config.passesLastSeenRemaining ?? 0
  if (remaining > lastSeen) {
    saveGlobalConfig(prev => ({
      ...prev,
      passesUpsellSeenCount: 0,
      hasVisitedPasses: false,
      passesLastSeenRemaining: remaining,
    }))
  }
}

function shouldShowGuestPassesUpsell(): boolean {
  return false
}

export function useShowGuestPassesUpsell(): boolean {
  const [show] = useState(() => shouldShowGuestPassesUpsell())
  return show
}

export function incrementGuestPassesSeenCount(): void {
  let newCount = 0
  saveGlobalConfig(prev => {
    newCount = (prev.passesUpsellSeenCount ?? 0) + 1
    return {
      ...prev,
      passesUpsellSeenCount: newCount,
    }
  })
  logEvent('tengu_guest_passes_upsell_shown', {
    seen_count: newCount,
  })
}

// Condensed layout for mini welcome screen
export function GuestPassesUpsell(): React.ReactNode {
  const reward = getCachedReferrerReward()
  return (
    <Text dimColor>
      <Text color="claude">[✻]</Text> <Text color="claude">[✻]</Text>{' '}
      <Text color="claude">[✻]</Text> ·{' '}
      {reward
        ? `Share Dekra CLI and earn ${formatCreditAmount(reward)} of extra usage · /passes`
        : '3 guest passes at /passes'}
    </Text>
  )
}
