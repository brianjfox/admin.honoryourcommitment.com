import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api.js'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    if (password.length < 10) return setError('Password must be at least 10 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    setBusy(true)
    try {
      await api.post('/auth/reset', { token, password })
      navigate('/login?reset=1')
    } catch (err) {
      setError(
        err.code === 'invalid_or_expired'
          ? 'This reset link is invalid or has expired. Request a new one.'
          : 'Could not reset your password. Please try again.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <form className="login__card" onSubmit={onSubmit}>
        <div className="brand brand--login">
          <span className="brand__shield" /> Honor Your Commitment
          <span className="brand__admin">Admin</span>
        </div>
        <h1>Set a new password</h1>
        {!token && <p className="form-error">Missing reset token.</p>}
        {error && <p className="form-error">{error}</p>}
        <label>
          New password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          Confirm password
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <button className="btn btn--gold" disabled={busy || !token}>
          {busy ? 'Saving…' : 'Set password'}
        </button>
      </form>
    </div>
  )
}
