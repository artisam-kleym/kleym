'use client'

import { useRouter } from 'next/navigation'
import { FactorPrompt } from '@/components/mfa/factor-prompt'

export function MfaLogin({ hasTotp, hasPasskey }: { hasTotp: boolean; hasPasskey: boolean }) {
  const router = useRouter()
  return <FactorPrompt purpose="login" hasTotp={hasTotp} hasPasskey={hasPasskey} onVerified={() => router.push('/dashboard')} />
}
