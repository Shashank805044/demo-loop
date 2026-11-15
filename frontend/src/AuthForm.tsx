import { useState } from 'react'
import { useAuth } from './useAuth'

export default function AuthForm({ message, onDone }: { message?: string; onDone?: () => void }) {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const err = await (mode === 'login' ? signIn : signUp)(email.trim(), password)
    setBusy(false)
    if (err) setError(err)
    else onDone?.()
  }

  const register = mode === 'register'
  return (
    <form className="card authform" onSubmit={submit}>
      <h2>{register ? 'Create your account' : 'Log in'}</h2>
      {message && <p className="sub">{message}</p>}
      <label>
        Email
        <input type="email" required autoComplete="username" value={email}
          onChange={e => setEmail(e.target.value)} />
      </label>
      <label>
        Password
        <input type="password" required minLength={register ? 8 : undefined}
          autoComplete={register ? 'new-password' : 'current-password'}
          value={password} onChange={e => setPassword(e.target.value)} />
      </label>
      {register && <small className="muted">At least 8 characters.</small>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button className="primary" type="submit" disabled={busy || !email || !password}>
          {busy ? 'Please wait…' : register ? 'Sign up' : 'Log in'}
        </button>
        <button type="button" className="link"
          onClick={() => { setMode(register ? 'login' : 'register'); setError('') }}>
          {register ? 'I already have an account' : 'Create an account'}
        </button>
      </div>
      {register && (
        <small className="muted">
          We store your email, your answers and their scores, and your saved questions, only to show your progress.
          You can delete everything from the Progress tab at any time.
        </small>
      )}
    </form>
  )
}
