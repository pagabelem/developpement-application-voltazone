'use client'

import { useActionState, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { loginAction, type LoginState } from '@/lib/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function LoginForm({ accounts }: { accounts: { role: string; email: string }[] }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, {})
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Connexion</CardTitle>
        <CardDescription>Accédez à votre espace chantier.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Adresse e-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11"
            />
          </div>
          {state.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          <Button type="submit" className="h-11" disabled={pending}>
            {pending && <Loader2 className="animate-spin" aria-hidden />}
            Se connecter
          </Button>
        </form>
        <div className="mt-6 border-t pt-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Remplir avec un compte de démo</p>
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => (
              <Button
                key={a.email}
                type="button"
                variant="outline"
                size="sm"
                className="h-11 md:h-8"
                onClick={() => {
                  setEmail(a.email)
                  setPassword('Voltazone2026!')
                }}
              >
                {a.role}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
