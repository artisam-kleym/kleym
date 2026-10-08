import type { Metadata } from 'next'
import { inter, jetbrainsMono, materialSymbols } from '@/lib/fonts'
import './globals.css'
import { WalletEnvironment } from '@/components/wallet-environment'
import { parseLanternOrigins } from '@/lib/wallet/lantern-config'

// Wallet origins and the public pairing identifier are runtime deployment settings.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Kleym',
  description: 'Distribute Stellar assets with a link. No wallet address required.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const rawProjectId = process.env.WALLETCONNECT_PROJECT_ID ?? ''
  const publicProjectId = /^[a-f0-9]{32}$/i.test(rawProjectId) ? rawProjectId : ''
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${materialSymbols.variable}`}
    >
      <body><WalletEnvironment origins={parseLanternOrigins(process.env.LANTERN_ORIGINS)} projectId={publicProjectId}>{children}</WalletEnvironment></body>
    </html>
  )
}
