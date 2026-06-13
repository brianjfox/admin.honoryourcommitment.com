import { useEffect, useState } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'

export default function Tags() {
  const { can } = useAuth()
  const [tags, setTags] = useState([])
  const [name, setName] = useState('')
  const [color, setColor] = useState('#c9a14a')
  const [err, setErr] = useState(null)

  const load = () => api.get('/tags').then((d) => setTags(d.tags))
  useEffect(() => {
    load()
  }, [])

  const create = async (e) => {
    e.preventDefault()
    setErr(null)
    try {
      await api.post('/tags', { name, color })
      setName('')
      load()
    } catch (e2) {
      setErr(e2.code === 'tag_exists' ? 'A tag with that name already exists.' : 'Could not create tag.')
    }
  }
  const remove = async (id) => {
    if (!confirm('Delete this tag and remove it from everyone?')) return
    await api.del('/tags/' + id)
    load()
  }

  return (
    <>
      <h1>Tags</h1>
      <p className="muted">
        Tags let you label arbitrary people (e.g. “media-contact”, “high-value”,
        “press-ready”) and then filter or group by them.
      </p>

      {can('tag') && (
        <form className="card inline" onSubmit={create}>
          <input
            placeholder="New tag name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            title="Color"
          />
          <button className="btn btn--gold">Create tag</button>
          {err && <span className="form-error">{err}</span>}
        </form>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Tag</th>
              <th>People</th>
              <th>Created</th>
              {can('delete_tag') && <th />}
            </tr>
          </thead>
          <tbody>
            {tags.map((t) => (
              <tr key={t.id}>
                <td>
                  <span
                    className="dot"
                    style={{ background: t.color || '#999' }}
                  />
                  {t.name}
                </td>
                <td>{t.count}</td>
                <td>{new Date(t.created_at).toLocaleDateString()}</td>
                {can('delete_tag') && (
                  <td>
                    <button className="btn btn--danger btn--sm" onClick={() => remove(t.id)}>
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {!tags.length && (
              <tr>
                <td colSpan="4" className="muted">
                  No tags yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
