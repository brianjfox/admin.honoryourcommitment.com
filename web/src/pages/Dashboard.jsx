import { useEffect, useState } from 'react'
import { api } from '../api.js'
import BarChart from '../components/BarChart.jsx'

const eur = (n) =>
  '€' + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })

export default function Dashboard() {
  const [s, setS] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    api.get('/stats/overview').then(setS).catch((e) => setErr(e.code || 'error'))
  }, [])

  if (err) return <div className="card">Could not load statistics ({err}).</div>
  if (!s) return <div className="muted">Loading…</div>

  const kpis = [
    { label: 'People', value: s.totals.people.toLocaleString() },
    { label: 'Confirmed', value: s.totals.confirmed.toLocaleString() },
    { label: 'Capital invested', value: eur(s.totals.invested) },
    { label: 'Avg. wait (yrs)', value: s.totals.avgWait },
    { label: 'Family members', value: s.totals.families.toLocaleString() },
  ]

  return (
    <>
      <h1>Dashboard</h1>
      <div className="kpis">
        {kpis.map((k) => (
          <div className="kpi" key={k.label}>
            <div className="kpi__value">{k.value}</div>
            <div className="kpi__label">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="grid2">
        <div className="card">
          <h3>By country</h3>
          <BarChart data={s.byCountry} />
        </div>
        <div className="card">
          <h3>By form</h3>
          <BarChart data={s.bySource} />
        </div>
        <div className="card">
          <h3>By application year</h3>
          <BarChart data={s.byYear} />
        </div>
        <div className="card">
          <h3>By investment type</h3>
          <BarChart data={s.byInvestmentType} />
        </div>
        <div className="card">
          <h3>Confirmation status</h3>
          <BarChart data={s.byConfirmed} />
        </div>
      </div>
    </>
  )
}
