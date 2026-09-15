import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Toaster } from 'sonner'

import { ThemeScript } from '@/components/theme-script'
import { TooltipProvider } from '@/components/ui/tooltip'

import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: {
    default: 'Switchboard',
    template: '%s · Switchboard',
  },
  description: 'Feature flags, targeting rules and staged rollouts for product teams.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}>
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: 'bg-surface border border-border text-fg shadow-[var(--shadow-popover)]',
            },
          }}
        />
      </body>
    </html>
  )
}
