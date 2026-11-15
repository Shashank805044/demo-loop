// API access with bearer-token login. Tokens live in localStorage (so login survives a refresh);
// an expired access token is refreshed once automatically.

export const API = import.meta.env.VITE_API_URL ?? 'http://localhost:5137'

type Tokens = { accessToken: string; refreshToken: string }
const KEY = 'ih.auth'

function load(): Tokens | null {
  try {
    const s = localStorage.getItem(KEY)
    return s ? (JSON.parse(s) as Tokens) : null
  } catch {
    return null
  }
}

let tokens: Tokens | null = load()
const listeners = new Set<() => void>()

function setTokens(t: Tokens | null) {
  tokens = t
  try {
    if (t) localStorage.setItem(KEY, JSON.stringify(t))
    else localStorage.removeItem(KEY)
  } catch {
    /* storage unavailable: login just won't persist */
  }
  listeners.forEach(l => l())
}

export const hasTokens = () => tokens !== null
export function onAuthChange(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

let refreshing: Promise<boolean> | null = null
function refresh(): Promise<boolean> {
  if (!tokens) return Promise.resolve(false)
  if (!refreshing) {
    const current = tokens
    refreshing = (async () => {
      try {
        const res = await fetch(`${API}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: current.refreshToken }),
        })
        if (!res.ok) { setTokens(null); return false } // session expired: log out
        const d = await res.json()
        setTokens({ accessToken: d.accessToken, refreshToken: d.refreshToken })
        return true
      } catch {
        return false // network problem: keep the tokens and let the caller see the failure
      } finally {
        refreshing = null
      }
    })()
  }
  return refreshing
}

/** fetch() against the API, adding the login token and retrying once after a token refresh. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const run = () => fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      ...(tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
    },
  })
  let res = await run()
  if (res.status === 401 && tokens && (await refresh())) res = await run()
  return res
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** Turns the API's error body into one readable sentence. */
async function errorText(res: Response, fallback: string): Promise<string> {
  if (res.status === 429) return 'Too many attempts. Wait a minute and try again.'
  try {
    const body = await res.json()
    if (body?.detail === 'LockedOut')
      return 'Too many failed logins. This account is locked for a few minutes.'
    if (body?.errors) {
      const msgs = Object.values(body.errors as Record<string, string[]>).flat()
      if (msgs.length) return msgs.join(' ')
    }
  } catch {
    /* no JSON body */
  }
  return fallback
}

/** Returns an error message, or null on success. */
export async function loginRequest(email: string, password: string): Promise<string | null> {
  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ email, password }),
    })
    if (!res.ok) return res.status === 401
      ? await errorText(res, 'Incorrect email or password.')
      : await errorText(res, 'Could not log in. Try again.')
    const d = await res.json()
    setTokens({ accessToken: d.accessToken, refreshToken: d.refreshToken })
    return null
  } catch {
    return 'Cannot reach the API. Is the backend running?'
  }
}

export async function registerRequest(email: string, password: string): Promise<string | null> {
  try {
    const res = await fetch(`${API}/api/auth/register`, {
      method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ email, password }),
    })
    if (!res.ok) return await errorText(res, 'Could not create the account.')
    return loginRequest(email, password)
  } catch {
    return 'Cannot reach the API. Is the backend running?'
  }
}

export function logoutLocal() {
  setTokens(null)
}
