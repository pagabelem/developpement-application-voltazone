'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  AlertOctagon,
  BarChart3,
  CalendarRange,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  History,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  Settings,
  Smartphone,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@prisma/client'
import { navForRole, type NavItem } from '@/lib/nav'
import { ROLE_LABELS } from '@/lib/constants'
import { logoutAction } from '@/lib/actions/auth'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { ThemeToggle } from '@/components/theme-toggle'

const ICONS: Record<NavItem['icon'], LucideIcon> = {
  dashboard: LayoutDashboard,
  zones: Map,
  suivi: ClipboardList,
  terrain: Smartphone,
  planning: CalendarRange,
  equipes: Users,
  blocages: AlertOctagon,
  rapports: FileText,
  import: FileSpreadsheet,
  parametres: Settings,
  audit: History,
}

type ShellUser = { name: string; email: string; role: Role }

function isActivePath(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
}

function NavLinks({ items, pathname, onNavigate }: { items: NavItem[]; pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Navigation principale" className="flex flex-col gap-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon]
        const active = isActivePath(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
              active
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Zap className="size-4" aria-hidden />
      </span>
      <span>VOLTAZONE</span>
    </Link>
  )
}

function UserBlock({ user }: { user: ShellUser }) {
  return (
    <div className="flex items-center gap-2 border-t pt-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{user.name}</span>
        <span className="truncate text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</span>
      </div>
      <form action={logoutAction}>
        <Button type="submit" variant="ghost" size="icon" className="size-11" aria-label="Se déconnecter">
          <LogOut className="size-4" />
        </Button>
      </form>
    </div>
  )
}

export function AppShell({
  user,
  projectName,
  children,
}: {
  user: ShellUser
  projectName: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const items = navForRole(user.role)
  const mobileItems = items.filter((i) => i.mobile)

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-4 border-r bg-sidebar p-3 lg:flex">
        <div className="px-2 pt-1">
          <Brand />
          <p className="mt-1 truncate text-xs text-muted-foreground">{projectName}</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          <NavLinks items={items} pathname={pathname} />
        </div>
        <UserBlock user={user} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-2 backdrop-blur lg:px-6">
          <Sheet>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" className="size-11 lg:hidden" aria-label="Ouvrir le menu" />
              }
            >
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent side="left" className="flex w-72 flex-col gap-4 p-3">
              <SheetTitle className="px-2 pt-2">
                <Brand />
              </SheetTitle>
              <div className="flex-1 overflow-y-auto">
                <NavLinks items={items} pathname={pathname} />
              </div>
              <UserBlock user={user} />
            </SheetContent>
          </Sheet>
          <div className="lg:hidden">
            <Brand />
          </div>
          <div className="hidden items-center gap-2 text-sm text-muted-foreground lg:flex">
            <BarChart3 className="size-4" aria-hidden />
            <span className="truncate">{projectName}</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            {user.role === 'CLIENT' && (
              <span className="hidden rounded-md border px-2 py-1 text-xs text-muted-foreground sm:inline">
                Lecture seule
              </span>
            )}
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 px-4 pt-4 pb-24 lg:px-6 lg:pt-6 lg:pb-8">{children}</main>

        <nav
          aria-label="Navigation rapide"
          className="fixed inset-x-0 bottom-0 z-30 flex border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
        >
          {mobileItems.map((item) => {
            const Icon = ICONS[item.icon]
            const active = isActivePath(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium',
                  active ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                <Icon className="size-5" aria-hidden />
                {item.label.replace('Tableau de bord', 'Accueil').replace('Saisie terrain', 'Terrain')}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
