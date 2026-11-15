import { createContext, useContext } from 'react'

export type Auth = {
  /** Logged-in user's email, or null. */
  email: string | null
  /** False while we check a saved login on page load. */
  ready: boolean
  /** Each returns an error message, or null on success. */
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string) => Promise<string | null>
  signOut: () => void
  /** Deletes the account and everything saved for it. */
  deleteAccount: () => Promise<boolean>
}

export const AuthCtx = createContext<Auth | null>(null)

export function useAuth(): Auth {
  const v = useContext(AuthCtx)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
