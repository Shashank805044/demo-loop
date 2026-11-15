import { useEffect, useState, type ReactNode } from 'react'
import { apiFetch, hasTokens, loginRequest, logoutLocal, onAuthChange, registerRequest } from './api'
import { AuthCtx, type Auth } from './useAuth'

async function fetchEmail(): Promise<string | null> {
  try {
    const res = await apiFetch('/api/auth/manage/info')
    return res.ok ? ((await res.json()).email as string) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null)
  const [ready, setReady] = useState(() => !hasTokens())

  // Restore a saved login.
  useEffect(() => {
    if (!hasTokens()) return
    fetchEmail().then(setEmail).finally(() => setReady(true))
  }, [])

  // Tokens cleared elsewhere (e.g. refresh failed): drop the user.
  useEffect(() => onAuthChange(() => { if (!hasTokens()) setEmail(null) }), [])

  async function after(err: string | null) {
    if (err) return err
    setEmail(await fetchEmail())
    return null
  }

  const value: Auth = {
    email,
    ready,
    signIn: async (e, p) => after(await loginRequest(e, p)),
    signUp: async (e, p) => after(await registerRequest(e, p)),
    signOut: () => { logoutLocal(); setEmail(null) },
    deleteAccount: async () => {
      const res = await apiFetch('/api/me', { method: 'DELETE' })
      if (res.ok) { logoutLocal(); setEmail(null) }
      return res.ok
    },
  }
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}
