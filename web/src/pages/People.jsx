import { useEffect, useState, useCallback } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'

const SOURCES = ['signature', 'case', 'claimant']

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : null)

export default function People() {
  const { can } = useAuth()
  const [filters, setFilters] = useState({
    q: '', country: '', source: '', year: '', investmentType: '', confirmed: '',
    tag: '', group: '',
  })
  const [data, setData] = useState({ people: [], total: 0 })
  const [tags, setTags] = useState([])
  const [groups, setGroups] = useState([])
  const [selected, setSelected] = useState(null) // detail for one person
  const [loading, setLoading] = useState(false)
  const [bulkGroup, setBulkGroup] = useState('')
  const [bulkMsg, setBulkMsg] = useState(null)

  const filterQS = useCallback(() => {
    const qs = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => v !== '' && qs.set(k, v))
    return qs
  }, [filters])

  const load = useCallback(() => {
    setLoading(true)
    api
      .get('/people?' + filterQS().toString())
      .then(setData)
      .finally(() => setLoading(false))
  }, [filterQS])

  const reloadGroups = () => api.get('/groups').then((d) => setGroups(d.groups))

  const addAllToGroup = async () => {
    if (!bulkGroup) return
    setBulkMsg(null)
    const r = await api.post(`/groups/${bulkGroup}/members/from-filter?${filterQS().toString()}`)
    setBulkMsg(`Added ${r.added} new member(s).`)
    reloadGroups()
  }

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    api.get('/tags').then((d) => setTags(d.tags))
    api.get('/groups').then((d) => setGroups(d.groups))
  }, [])

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }))

  const openDetail = (email) =>
    api.get('/people/' + encodeURIComponent(email)).then(setSelected)

  return (
    <>
      <h1>People</h1>

      <div className="card filters">
        <input placeholder="Search name / email" value={filters.q} onChange={set('q')} />
        <input placeholder="Country" value={filters.country} onChange={set('country')} />
        <select value={filters.source} onChange={set('source')}>
          <option value="">Any form</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          placeholder="App. year"
          value={filters.year}
          onChange={set('year')}
          type="number"
        />
        <input
          placeholder="Investment type"
          value={filters.investmentType}
          onChange={set('investmentType')}
        />
        <select value={filters.confirmed} onChange={set('confirmed')}>
          <option value="">Any status</option>
          <option value="true">Confirmed</option>
          <option value="false">Unconfirmed</option>
        </select>
        <select value={filters.tag} onChange={set('tag')}>
          <option value="">Any tag</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select value={filters.group} onChange={set('group')}>
          <option value="">Any group</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>

      <div className="bulk-bar">
        <span className="muted">{loading ? 'Loading…' : `${data.total} people`}</span>
        {can('curate') && groups.length > 0 && data.total > 0 && (
          <span className="bulk-actions">
            <select value={bulkGroup} onChange={(e) => setBulkGroup(e.target.value)}>
              <option value="">Add all matching to group…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <button className="btn" onClick={addAllToGroup} disabled={!bulkGroup}>
              Add {data.total}
            </button>
            {bulkMsg && <span className="muted small">{bulkMsg}</span>}
          </span>
        )}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Country</th>
              <th>Forms</th>
              <th>Year</th>
              <th>Status</th>
              <th>Tags</th>
            </tr>
          </thead>
          <tbody>
            {data.people.map((p) => (
              <tr key={p.email} onClick={() => openDetail(p.email)} className="row">
                <td>{p.name || '—'}</td>
                <td>{p.email}</td>
                <td>{p.country}</td>
                <td>{(p.sources || []).join(', ')}</td>
                <td>{p.application_year || '—'}</td>
                <td>
                  <span className={'pill ' + (p.confirmed ? 'pill--ok' : 'pill--muted')}>
                    {p.confirmed ? 'confirmed' : 'unconfirmed'}
                  </span>
                </td>
                <td>
                  {(p.tags || []).map((t) => (
                    <span className="tag" key={t.id}>
                      {t.name}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <Detail
          data={selected}
          tags={tags}
          groups={groups}
          can={can}
          onClose={() => setSelected(null)}
          onChanged={() => {
            openDetail(selected.person.email)
            load()
          }}
        />
      )}
    </>
  )
}

function Detail({ data, tags, groups, can, onClose, onChanged }) {
  const { person, records, groups: memberOf } = data
  const allRecords = [
    ...records.signatures.map((r) => ({ type: 'signature', record: r })),
    ...records.cases.map((r) => ({ type: 'case', record: r })),
    ...records.claimants.map((r) => ({ type: 'claimant', record: r })),
  ]
  const confirmedCount = allRecords.filter((x) => x.record.confirmed_at).length
  const [tagId, setTagId] = useState('')
  const [groupId, setGroupId] = useState('')
  const email = person.email

  const addTag = async () => {
    if (!tagId) return
    await api.post(`/people/${encodeURIComponent(email)}/tags`, { tagId })
    onChanged()
  }
  const removeTag = async (id) => {
    await api.del(`/people/${encodeURIComponent(email)}/tags/${id}`)
    onChanged()
  }
  const addToGroup = async () => {
    if (!groupId) return
    await api.post(`/groups/${groupId}/members`, { email })
    onChanged()
  }
  const removePerson = async () => {
    if (!confirm(`Delete ${email} and all their records? This cannot be undone.`))
      return
    await api.del(`/people/${encodeURIComponent(email)}`)
    onClose()
    onChanged()
  }

  return (
    <div className="drawer">
      <div className="drawer__scrim" onClick={onClose} />
      <aside className="drawer__panel">
        <button className="drawer__close" onClick={onClose}>
          ×
        </button>
        <h2>{person.name || email}</h2>
        <p className="muted">{email}</p>

        <dl className="kv">
          <div><dt>Country</dt><dd>{(person.countries || []).join(', ')}</dd></div>
          <div><dt>Forms</dt><dd>{(person.sources || []).join(', ')}</dd></div>
          <div><dt>App. year</dt><dd>{person.application_year || '—'}</dd></div>
          <div><dt>Investment</dt><dd>{person.investment_type || '—'}</dd></div>
          <div><dt>Confirmed</dt><dd>{confirmedCount} of {allRecords.length} record(s)</dd></div>
        </dl>

        <h3>Tags</h3>
        <div className="chips">
          {(person.tags || []).map((t) => (
            <span className="tag" key={t.id}>
              {t.name}
              {can('curate') && (
                <button className="tag__x" onClick={() => removeTag(t.id)}>
                  ×
                </button>
              )}
            </span>
          ))}
          {!person.tags?.length && <span className="muted">None</span>}
        </div>
        {can('curate') && (
          <div className="inline">
            <select value={tagId} onChange={(e) => setTagId(e.target.value)}>
              <option value="">Add tag…</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button className="btn" onClick={addTag}>
              Add
            </button>
          </div>
        )}

        <h3>Groups</h3>
        <div className="chips">
          {(memberOf || []).map((g) => (
            <span className="tag" key={g.id}>
              {g.name}
            </span>
          ))}
          {!memberOf?.length && <span className="muted">None</span>}
        </div>
        {can('curate') && (
          <div className="inline">
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">Add to group…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <button className="btn" onClick={addToGroup}>
              Add
            </button>
          </div>
        )}

        <h3>Records &amp; confirmation</h3>
        {allRecords.length === 0 ? (
          <p className="muted">No records.</p>
        ) : (
          <div className="records">
            {allRecords.map(({ type, record }) => (
              <RecordCard
                key={type + record.id}
                type={type}
                record={record}
                canEdit={can('edit_data')}
                canResend={can('curate')}
                onSaved={onChanged}
              />
            ))}
          </div>
        )}

        {can('delete_data') && (
          <button className="btn btn--danger" onClick={removePerson}>
            Delete person &amp; all records
          </button>
        )}
      </aside>
    </div>
  )
}

const RECORD_FIELDS = {
  signature: [
    ['first_name', 'First name', 'text'],
    ['last_name', 'Last name', 'text'],
    ['country', 'Country', 'text'],
    ['consent_public', 'Public', 'bool'],
    ['consent_contact', 'Contact updates', 'bool'],
  ],
  case: [
    ['first_name', 'First name', 'text'],
    ['last_name', 'Last name', 'text'],
    ['phone', 'Phone', 'text'],
    ['country', 'Country', 'text'],
    ['application_year', 'Application year', 'int'],
    ['investment_type', 'Investment type', 'text'],
    ['investment_amount', 'Amount (EUR)', 'num'],
    ['family_members', 'Family members', 'int'],
    ['status', 'Status', 'text'],
    ['story', 'Story', 'textarea'],
  ],
  claimant: [
    ['full_name', 'Full name', 'text'],
    ['country', 'Country', 'text'],
    ['application_year', 'Application year', 'int'],
    ['message', 'Message', 'textarea'],
  ],
}

// One campaign record: its confirmation status + dates, read-only for viewers
// and inline-editable for SUPER_ADMIN (edit_data).
function RecordCard({ type, record, canEdit, canResend, onSaved }) {
  const fields = RECORD_FIELDS[type]
  const seed = () => {
    const o = {}
    for (const [k] of fields) o[k] = record[k] == null ? '' : record[k]
    return o
  }
  const [form, setForm] = useState(seed)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [resend, setResend] = useState({ busy: false, msg: null })
  const confirmed = !!record.confirmed_at

  const resendConfirmation = async () => {
    setResend({ busy: true, msg: null })
    try {
      const r = await api.post(`/records/${type}/${record.id}/resend-confirmation`)
      setResend({
        busy: false,
        msg: r.sent ? `Sent to ${r.to}` : 'Email disabled — link logged on the server',
      })
    } catch (e) {
      setResend({
        busy: false,
        msg: e.code === 'already_confirmed' ? 'Already confirmed' : 'Could not send',
      })
    }
  }

  const set = (k, type2) => (e) =>
    setForm((f) => ({ ...f, [k]: type2 === 'bool' ? e.target.checked : e.target.value }))

  const save = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await api.patch(`/records/${type}/${record.id}`, form)
      setSaved(true)
      onSaved?.()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="record-edit">
      <div className="record-edit__head">
        <span>
          {type} <span className="muted small">#{String(record.id).slice(0, 8)}</span>
        </span>
        <span className={'pill ' + (confirmed ? 'pill--ok' : 'pill--muted')}>
          {confirmed ? 'confirmed' : 'unconfirmed'}
        </span>
      </div>
      <div className="muted small record-edit__dates">
        Submitted {fmtDate(record.created_at) || '—'}
        {confirmed ? ` · Confirmed ${fmtDate(record.confirmed_at)}` : ''}
      </div>

      {!confirmed && canResend && (
        <div className="record-edit__resend">
          <button className="btn btn--sm" onClick={resendConfirmation} disabled={resend.busy}>
            {resend.busy ? 'Sending…' : 'Resend confirmation'}
          </button>
          {resend.msg && <span className="muted small">{resend.msg}</span>}
        </div>
      )}

      {canEdit ? (
        <>
          {fields.map(([k, label, kind]) => (
            <label key={k} className="record-edit__field">
              <span>{label}</span>
              {kind === 'bool' ? (
                <input type="checkbox" checked={!!form[k]} onChange={set(k, 'bool')} />
              ) : kind === 'textarea' ? (
                <textarea rows="2" value={form[k]} onChange={set(k)} />
              ) : (
                <input
                  type={kind === 'int' || kind === 'num' ? 'number' : 'text'}
                  value={form[k]}
                  onChange={set(k)}
                />
              )}
            </label>
          ))}
          <button className="btn btn--sm" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
          </button>
        </>
      ) : (
        <dl className="kv record-edit__readonly">
          {fields.map(([k, label, kind]) => {
            let val = record[k]
            if (kind === 'bool') val = val ? 'Yes' : 'No'
            else if (val == null || val === '') val = '—'
            return (
              <div key={k}>
                <dt>{label}</dt>
                <dd>{String(val)}</dd>
              </div>
            )
          })}
        </dl>
      )}
    </div>
  )
}
