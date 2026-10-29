import type { Role } from '@prisma/client'

export type NavItem = {
  href: string
  label: string
  icon:
    | 'dashboard'
    | 'zones'
    | 'suivi'
    | 'terrain'
    | 'planning'
    | 'equipes'
    | 'blocages'
    | 'rapports'
    | 'import'
    | 'parametres'
    | 'audit'
  roles?: Role[]
  mobile?: boolean
}

const MANAGERS: Role[] = ['ADMIN', 'CONDUCTEUR']
const EDITORS: Role[] = ['ADMIN', 'CONDUCTEUR', 'CHEF_CFO', 'CHEF_CFA']

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Tableau de bord', icon: 'dashboard', mobile: true },
  { href: '/zones', label: 'Zones', icon: 'zones' },
  { href: '/suivi', label: 'Suivi', icon: 'suivi', mobile: true },
  { href: '/terrain', label: 'Saisie terrain', icon: 'terrain', roles: EDITORS, mobile: true },
  { href: '/planning', label: 'Planning', icon: 'planning' },
  { href: '/equipes', label: 'Équipes', icon: 'equipes' },
  { href: '/blocages', label: 'Blocages', icon: 'blocages', mobile: true },
  { href: '/rapports', label: 'Rapports', icon: 'rapports' },
  { href: '/import', label: 'Import Excel', icon: 'import', roles: MANAGERS },
  { href: '/parametres', label: 'Paramètres', icon: 'parametres', roles: MANAGERS },
  { href: '/audit', label: "Journal d'audit", icon: 'audit', roles: MANAGERS },
]

export function navForRole(role: Role) {
  return NAV_ITEMS.filter((i) => !i.roles || i.roles.includes(role))
}
