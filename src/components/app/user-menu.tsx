'use client'

import { LogOut } from 'lucide-react'
import * as React from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { logout } from '@/server/auth/actions'

interface UserMenuProps {
  name: string
  email: string
  color: string
  role: string
}

export function UserMenu({ name, email, color, role }: UserMenuProps) {
  const [, startTransition] = React.useTransition()

  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full items-center gap-2 rounded-[var(--radius-control)] p-2 text-left transition-colors hover:bg-surface-raised"
        aria-label={`Account menu for ${name}`}
      >
        <span
          className="grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        >
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fg">{name}</span>
          <span className="block truncate text-xs text-fg-subtle capitalize">
            {role.toLowerCase()}
          </span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>{email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            // Radix unmounts the menu's contents as soon as an item is
            // selected. A <form action={logout}> nested here would be torn
            // down before it ever submits, so call the action directly and
            // let the menu close on its own.
            event.preventDefault()
            startTransition(() => {
              void logout()
            })
          }}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
