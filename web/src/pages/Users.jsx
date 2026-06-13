import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'

const ROLES = ['SUPER_ADMIN', 'ADMIN', 'VIEWER']

export default function Users() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'VIEWER' })
  const [err, setErr] = useState(null)

  const load = () => api.get('/users').then((d) => setUsers(d.users))
  useEffect(() => {
    load()
  }, [])

  const create = async (e) => {
    e.preventDefault()
    setErr(null)
    try {
      await api.post('/users', form)
      setForm({ email: '', name: '', password: '', role: 'VIEWER' })
      load()
    } catch (e2) {
      setErr(
        e2.code === 'user_exists'
          ? 'That email already has an account.'
          : e2.code === 'password_too_short'
            ? 'Password must be at least 10 characters.'
            : 'Could not create user.'
      )
    }
  }
  const setRole = async (id, role) => {
    await api.patch('/users/' + id, { role })
    load()
  }
  const toggleActive = async (u) => {
    await api.patch('/users/' + u.id, { active: !u.active })
    load()
  }
  const remove = async (u) => {
    if (!confirm(`Delete admin user ${u.email}?`)) return
    try {
      await api.del('/users/' + u.id)
      load()
    } catch (e2) {
      alert(e2.code || 'Could not delete user.')
    }
  }

  return (
    <>
      <h1>Admin users</h1>
      <p className="muted">
        SUPER_ADMIN: full CRUD + user management. ADMIN: create tags/groups and
        curate membership. VIEWER: dashboards and data only.
      </p>

      <form className="card inline" onSubmit={create}>
        <input
          placeholder="Email"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          required
        />
        <input
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          placeholder="Password (min 10)"
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
        />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button className="btn btn--gold">Create user</button>
        {err && <span className="form-error">{err}</span>}
      </form>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Last login</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const self = u.id === me.id
              return (
                <tr key={u.id} className={u.active ? '' : 'dim'}>
                  <td>{u.email}{self && <span className="muted small"> (you)</span>}</td>
                  <td>{u.name || '—'}</td>
                  <td>
                    <select
                      value={u.role}
                      disabled={self}
                      onChange={(e) => setRole(u.id, e.target.value)}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{u.active ? 'active' : 'inactive'}</td>
                  <td>{u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '—'}</td>
                  <td className="row-actions">
                    {!self && (
                      <>
                        <button className="btn btn--sm" onClick={() => toggleActive(u)}>
                          {u.active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button className="btn btn--danger btn--sm" onClick={() => remove(u)}>
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
