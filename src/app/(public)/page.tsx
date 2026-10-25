import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { env } from '@/lib/config/env'
import { resolveSession } from '@/lib/auth/session'
import { appEntryPath } from '@/lib/config/app-entry'
import { MarketingHome } from '@/components/marketing/marketing-home'
import { HomeMotion } from './home-motion'
import s from './home.module.css'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = {
  title: 'Kleym — Send prizes with a link',
  description:
    'Create a Stellar asset campaign, set an amount for each recipient, and share individual claim links.',
}

export default async function Home() {
  if (env.MARKETING_SITE_URL) {
    const session = await resolveSession()
    redirect(appEntryPath(session?.state ?? null))
  }
  // Expand-first rollout: retain the old homepage until the static site is verified.
  return (
    <MarketingHome
      styles={s}
      appHref="/login"
      testnet={env.STELLAR_NETWORK === 'testnet'}
      year={new Date().getFullYear()}
      motion={<HomeMotion />}
    />
  )
}
