import type { Metadata } from 'next'
import { inter, jetbrainsMono, materialSymbols } from '@/lib/fonts'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kleym',
  description: 'Distribute Stellar assets with a link. No wallet address required.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${materialSymbols.variable}`}
    >
      <body>{children}</body>
    </html>
  )
}
