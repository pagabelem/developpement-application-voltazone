'use server'

import { AuthError } from 'next-auth'
import { signIn, signOut } from '@/auth'

export type LoginState = { error?: string }

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  try {
    await signIn('credentials', {
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
      redirectTo: '/',
    })
    return {}
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: 'Identifiants invalides ou compte désactivé.' }
    }
    throw error
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: '/connexion' })
}
