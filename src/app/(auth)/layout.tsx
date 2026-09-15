import Link from 'next/link'

import { ToggleRight } from 'lucide-react'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2 text-fg">
        <ToggleRight className="size-6 text-accent" aria-hidden="true" />
        <span className="text-lg font-semibold tracking-tight">Switchboard</span>
      </Link>
      <main className="w-full max-w-sm">{children}</main>
    </div>
  )
}
