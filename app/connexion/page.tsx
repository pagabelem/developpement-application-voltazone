import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Zap } from 'lucide-react'
import { auth } from '@/auth'
import { LoginForm } from '@/components/auth/login-form'
import { ThemeToggle } from '@/components/theme-toggle'

export const metadata: Metadata = { title: 'Connexion' }

const DEMO_ACCOUNTS = [
  { role: 'Administrateur', email: 'admin@voltazone.fr' },
  { role: 'Conducteur de travaux', email: 'conducteur@voltazone.fr' },
  { role: "Chef d'équipe CFO", email: 'chef.cfo@voltazone.fr' },
  { role: "Chef d'équipe CFA", email: 'chef.cfa@voltazone.fr' },
  { role: 'Client (lecture seule)', email: 'client@voltazone.fr' },
]

export default async function LoginPage() {
  const session = await auth()
  if (session?.user) redirect('/')

  return (
    <main className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Zap className="size-4" aria-hidden />
          </span>
          VOLTAZONE
        </div>
        <ThemeToggle />
      </header>
      <div className="flex flex-1 items-center justify-center px-4 pb-12">
        <div className="grid w-full max-w-4xl gap-8 md:grid-cols-2 md:items-center">
          <section className="flex flex-col gap-4">
            <p className="flex gap-2 font-mono text-xs font-semibold uppercase tracking-widest">
              <span className="text-cfo">CFO</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-cfa">CFA</span>
            </p>
            <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
              Pilotage du chantier électrique du stade
            </h1>
            <p className="text-pretty leading-relaxed text-muted-foreground">
              Suivez l&apos;avancement par zone, niveau et système, levez les blocages et partagez des rapports à jour
              avec la maîtrise d&apos;ouvrage.
            </p>
            <div className="hidden rounded-lg border bg-card p-4 md:block">
              <p className="mb-2 text-sm font-medium">Comptes de démonstration</p>
              <ul className="flex flex-col gap-1 text-sm">
                {DEMO_ACCOUNTS.map((a) => (
                  <li key={a.email} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{a.role}</span>
                    <span className="font-mono text-xs">{a.email}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                Mot de passe : <span className="font-mono text-foreground">Voltazone2026!</span>
              </p>
            </div>
          </section>
          <LoginForm accounts={DEMO_ACCOUNTS} />
        </div>
      </div>
    </main>
  )
}
