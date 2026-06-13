import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'

export default function Groups() {
  const { can } = useAuth()
  const [groups, setGroups] = useState([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [err, setErr] = useState(null)
  const [members, setMembers] = useState(null) // { group, members[] }

  const load = () => api.get('/groups').then((d) => setGroups(d.groups))
  useEffect(() => {
    load()
  }, [])

  const create = async (e) => {
    e.preventDefault()
    setErr(null)
    try {
      await api.post('/groups', { name, description })
      setName('')
      setDescription('')
      load()
    } catch (e2) {
      setErr(e2.code === 'group_exists' ? 'A group with that name already exists.' : 'Could not create group.')
    }
  }
  const remove = async (id) => {
    if (!confirm('Delete this group? (People and their data are not affected.)')) return
    await api.del('/groups/' + id)
    if (members?.group?.id === id) setMembers(null)
    load()
  }
  const viewMembers = async (g) => {
    const d = await api.get(`/groups/${g.id}/members`)
    setMembers({ group: g, members: d.members })
  }
  const removeMember = async (email) => {
    await api.del(`/groups/${members.group.id}/members/${encodeURIComponent(email)}`)
    viewMembers(members.group)
    load()
  }

  return (
    <>
      <h1>Groups</h1>
      <p className="muted">
        Groups are saved collections of people — build them on the People page by
        adding individuals, or from the filtered results of a demographic query.
      </p>

      {can('group') && (
        <form className="card inline" onSubmit={create}>
          <input
            placeholder="New group name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button className="btn btn--gold">Create group</button>
          {err && <span className="form-error">{err}</span>}
        </form>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Group</th>
              <th>Members</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id}>
                <td>
                  {g.name}
                  {g.description && <div className="muted small">{g.description}</div>}
                </td>
                <td>{g.count}</td>
                <td>{new Date(g.created_at).toLocaleDateString()}</td>
                <td className="row-actions">
                  <button className="btn btn--sm" onClick={() => viewMembers(g)}>
                    Members
                  </button>
                  {can('delete_group') && (
                    <button className="btn btn--danger btn--sm" onClick={() => remove(g.id)}>
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!groups.length && (
              <tr>
                <td colSpan="4" className="muted">
                  No groups yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {members && (
        <div className="drawer">
          <div className="drawer__scrim" onClick={() => setMembers(null)} />
          <aside className="drawer__panel">
            <button className="drawer__close" onClick={() => setMembers(null)}>
              ×
            </button>
            <h2>{members.group.name}</h2>
            <p className="muted">{members.members.length} member(s)</p>
            <ul className="member-list">
              {members.members.map((m) => (
                <li key={m.email}>
                  <span>
                    <strong>{m.name || m.email}</strong>
                    <span className="muted small"> · {m.email} · {m.country}</span>
                  </span>
                  {can('curate') && (
                    <button className="btn btn--sm" onClick={() => removeMember(m.email)}>
                      Remove
                    </button>
                  )}
                </li>
              ))}
              {!members.members.length && <li className="muted">No members.</li>}
            </ul>
          </aside>
        </div>
      )}
    </>
  )
}
