// Dependency-free horizontal bar chart.
export default function BarChart({ data, format }) {
  const rows = data || []
  const max = Math.max(1, ...rows.map((d) => Number(d.value) || 0))
  if (!rows.length) return <p className="muted">No data.</p>
  return (
    <ul className="bars">
      {rows.map((d) => (
        <li key={d.label} className="bars__row">
          <span className="bars__label" title={d.label}>
            {d.label}
          </span>
          <span className="bars__track">
            <span
              className="bars__fill"
              style={{ width: `${(Number(d.value) / max) * 100}%` }}
            />
          </span>
          <span className="bars__value">
            {format ? format(d.value) : d.value}
          </span>
        </li>
      ))}
    </ul>
  )
}
