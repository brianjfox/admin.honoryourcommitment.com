import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import { api } from '../api.js'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [sp] = useSearchParams()
  const justReset = sp.get('reset') === '1'
  const [mode, setMode] = useState('login') // 'login' | 'forgot'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email, password)
      navigate('/')
    } catch (err) {
      setError(
        err.code === 'invalid_credentials'
          ? 'Incorrect email or password.'
          : 'Could not sign in. Please try again.'
      )
    } finally {
      setBusy(false)
    }
  }

  const onForgot = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.post('/auth/forgot', { email })
      setSent(true)
    } catch {
      setSent(true) // never reveal whether the email exists
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <form className="login__card" onSubmit={mode === 'login' ? onSubmit : onForgot}>
        <div className="brand brand--login">
          <span className="brand__shield" /> Honor Your Commitment
          <span className="brand__admin">Admin</span>
        </div>

        {mode === 'login' ? (
          <>
            <h1>Sign in</h1>
            {justReset && (
              <p className="form-ok">Password updated — please sign in.</p>
            )}
            {error && <p className="form-error">{error}</p>}
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
            </label>
            <label>
              Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </label>
            <button className="btn btn--gold" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            <button
              type="button"
              className="linkbtn"
              onClick={() => { setMode('forgot'); setError(null) }}
            >
              Forgot password?
            </button>
          </>
        ) : sent ? (
          <>
            <h1>Check your email</h1>
            <p className="muted">
              If an account exists for that address, we’ve sent a reset link. It
              expires in one hour.
            </p>
            <button type="button" className="btn" onClick={() => { setMode('login'); setSent(false) }}>
              Back to sign in
            </button>
          </>
        ) : (
          <>
            <h1>Reset password</h1>
            <p className="muted">Enter your email and we’ll send a reset link.</p>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
            </label>
            <button className="btn btn--gold" disabled={busy}>
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
            <button type="button" className="linkbtn" onClick={() => setMode('login')}>
              Back to sign in
            </button>
          </>
        )}
      </form>
    </div>
  )
}
