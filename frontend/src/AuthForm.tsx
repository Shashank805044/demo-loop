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
    <form className="authform" onSubmit={submit}>
      <div>
        <h2 id="auth-title">{register ? 'Create your account' : 'Welcome back'}</h2>
        <p className="muted">{message ?? (register ? 'Save your scores and questions.' : 'Log in to see your progress.')}</p>
      </div>
      <label className="field">
        Email
        <input type="email" required autoComplete="username" value={email}
          onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
      </label>
      <label className="field">
        Password
        <input type="password" required minLength={register ? 8 : undefined}
          autoComplete={register ? 'new-password' : 'current-password'}
          value={password} onChange={e => setPassword(e.target.value)}
          placeholder={register ? 'At least 8 characters' : ''} />
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={busy || !email || !password}>
        {busy ? 'Please wait…' : register ? 'Create account' : 'Log in'}
      </button>
      <div className="row">
        <span className="muted">{register ? 'Already have an account?' : 'New here?'}</span>
        <button type="button" className="link"
          onClick={() => { setMode(register ? 'login' : 'register'); setError('') }}>
          {register ? 'Log in' : 'Create an account'}
        </button>
      </div>
      {register && (
        <small>
          We store your email, your answers with their scores, and your saved questions, only to show your progress.
          You can delete everything from the Progress tab at any time.
        </small>
      )}
    </form>
  )
}
