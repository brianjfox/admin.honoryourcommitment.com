import { useEffect, useState, useCallback } from 'react'
import { api } from '../api.js'

// Build the audience filter object + a human label from the selected target.
function audienceOf(target, groups) {
  if (target === 'all') return { query: {}, label: 'All contactable contacts' }
  const g = groups.find((x) => String(x.id) === String(target))
  return { query: { group: target }, label: g ? `Group: ${g.name}` : 'Group' }
}

export default function Broadcasts() {
  const [groups, setGroups] = useState([])
  const [list, setList] = useState([])
  const [target, setTarget] = useState('all')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [count, setCount] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null) // {id, status, total, sent_count, failed_count}
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)

  const reloadList = useCallback(() => {
    api.get('/broadcasts').then((d) => setList(d.broadcasts)).catch(() => {})
  }, [])

  useEffect(() => {
    api.get('/groups').then((d) => setGroups(d.groups)).catch(() => {})
    reloadList()
  }, [reloadList])

  // Preview eligible-recipient count whenever the target changes.
  useEffect(() => {
    const { query } = audienceOf(target, groups)
    const qs = query.group ? `?group=${encodeURIComponent(query.group)}` : ''
    setCount(null)
    api
      .get('/broadcasts/recipients' + qs)
      .then((d) => setCount(d.count))
      .catch(() => setCount(null))
  }, [target, groups])

  // Poll an in-flight broadcast until it finishes.
  useEffect(() => {
    if (!progress || progress.status !== 'sending') return
    const t = setTimeout(() => {
      api
        .get('/broadcasts/' + progress.id)
        .then((d) => {
          setProgress(d.broadcast)
          if (d.broadcast.status !== 'sending') reloadList()
        })
        .catch(() => {})
    }, 1500)
    return () => clearTimeout(t)
  }, [progress, reloadList])

  const send = async () => {
    setErr(null)
    setMsg(null)
    const { query, label } = audienceOf(target, groups)
    if (subject.trim().length < 3 || body.trim().length < 3) {
      setErr('Add a subject and a message body.')
      return
    }
    if (
      !window.confirm(
        `Send "${subject.trim()}" to ${count ?? '?'} contact(s) — ${label}?\n\nThis cannot be undone.`
      )
    )
      return
    setBusy(true)
    try {
      const res = await api.post('/broadcasts', {
        subject: subject.trim(),
        body: body.trim(),
        query,
        audienceLabel: label,
      })
      setMsg(`Sending to ${res.total} contact(s)…`)
      setProgress({ id: res.id, status: 'sending', total: res.total, sent_count: 0, failed_count: 0 })
      setSubject('')
      setBody('')
      reloadList()
    } catch (e) {
      setErr(
        e.code === 'no_recipients'
          ? 'No eligible recipients for that audience.'
          : 'Could not send the broadcast.'
      )
    } finally {
      setBusy(false)
    }
  }

  const fmt = (d) => (d ? new Date(d).toLocaleString() : '—')

  return (
    <div>
      <h1>Broadcasts</h1>
      <p className="muted small">
        Campaign-update emails reach only people who consented to be contacted, confirmed
        their address, and haven’t unsubscribed. Every message includes a one-click
        unsubscribe link.
      </p>

      <div className="card">
        <h3>Compose</h3>
        {err && <p className="form-error">{err}</p>}
        {msg && <p className="form-ok">{msg}</p>}

        <div className="grid2">
          <label className="field">
            <span>Audience</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="all">All contactable contacts</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  Group: {g.name} ({g.count})
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span className="muted small">Eligible recipients</span>
            <div className="recip-count">{count == null ? '…' : count}</div>
          </div>
        </div>

        <label className="field">
          <span>Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
        </label>
        <label className="field">
          <span>Message</span>
          <textarea
            rows={10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your campaign update. Blank lines start a new paragraph."
          />
        </label>

        <div className="inline">
          <button
            className="btn btn--gold"
            disabled={busy || !count || (progress && progress.status === 'sending')}
            onClick={send}
          >
            {busy ? 'Sending…' : `Send to ${count ?? 0} contact(s)`}
          </button>
          {progress && (
            <span className="muted small">
              {progress.status === 'sending' ? 'Sending' : 'Done'}: {progress.sent_count}/
              {progress.total} sent
              {progress.failed_count ? `, ${progress.failed_count} failed` : ''}
            </span>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Sent broadcasts</h3>
        {list.length === 0 ? (
          <p className="muted small">No broadcasts yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Audience</th>
                  <th>Status</th>
                  <th>Sent</th>
                  <th>Failed</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {list.map((b) => (
                  <tr key={b.id}>
                    <td>{b.subject}</td>
                    <td className="small">{b.audience_label || '—'}</td>
                    <td>
                      <span
                        className={
                          'pill ' + (b.status === 'sent' ? 'pill--ok' : 'pill--muted')
                        }
                      >
                        {b.status}
                      </span>
                    </td>
                    <td>
                      {b.sent_count}/{b.total}
                    </td>
                    <td>{b.failed_count || 0}</td>
                    <td className="small">{fmt(b.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
