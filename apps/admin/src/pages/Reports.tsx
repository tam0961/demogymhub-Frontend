import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { METHODS, METHOD_LABEL, barLayout, fmtMoney } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import type { Dashboard } from '../types'

const CH = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)']

export function RevenueBars({ data }: { data: { date: string; amount: number }[] }) {
  const H = 160
  const hs = barLayout(data.map((d) => d.amount), H)
  const W = 56
  return (
    <svg className="chart" viewBox={`0 0 ${data.length * W} ${H + 40}`} role="img" aria-label="Doanh thu 7 ngày gần nhất">
      {data.map((d, i) => (
        <g key={d.date} transform={`translate(${i * W},0)`}>
          <rect x={8} y={H - hs[i]} width={W - 16} height={hs[i]} rx={4} fill={CH[0]}><title>{`${d.date}: ${fmtMoney(d.amount)}`}</title></rect>
          <text x={W / 2} y={H + 16} textAnchor="middle" fontSize="11" fill="var(--muted)">{d.date.slice(8, 10)}/{d.date.slice(5, 7)}</text>
        </g>
      ))}
    </svg>
  )
}

export default function Reports() {
  const { branchId } = useBranch()
  const [d, setD] = useState<Dashboard | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/reports/dashboard', { params: { branch_id: branchId ?? undefined } })
      .then((r) => { setD(r.data.data); setError('') })
      .catch((e) => setError(apiError(e).message))
  }, [branchId])

  if (error) return <div className="empty" role="alert">{error}</div>
  if (!d) return <div className="loading">Đang tải...</div>

  const kpis: { label: string; value: string }[] = [
    { label: 'Doanh thu hôm nay', value: fmtMoney(d.revenue_today) },
    { label: 'Hợp đồng mới', value: String(d.new_contracts_today) },
    { label: 'Hội viên đang hiệu lực', value: String(d.active_members) },
    { label: 'Sắp hết hạn (7 ngày)', value: String(d.expiring_in_7_days) },
    { label: 'Lượt check-in', value: `${d.checkins_today}` },
    { label: 'Công nợ', value: fmtMoney(d.debt_total) },
  ]
  const total = METHODS.reduce((s, m) => s + (d.revenue_by_method[m] ?? 0), 0)

  return (
    <>
      <div className="page-head"><h1>Báo cáo</h1></div>
      <div className="kpis">
        {kpis.map((k) => (
          <div key={k.label} className="card kpi">
            <span className="kpi-label">{k.label}</span>
            <span className="display kpi-value">{k.value}</span>
          </div>
        ))}
      </div>
      <div className="grid-2">
        <section className="card pad">
          <h2 className="sec">Doanh thu 7 ngày</h2>
          <RevenueBars data={d.revenue_7d} />
        </section>
        <section className="card pad stack">
          <h2 className="sec">Doanh thu theo phương thức</h2>
          {METHODS.map((m, i) => {
            const v = d.revenue_by_method[m] ?? 0
            return (
              <div key={m} className="bar-row">
                <span>{METHOD_LABEL[m]}</span>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${total ? (v / total) * 100 : 0}%`, background: CH[i] }} /></div>
                <span className="num">{fmtMoney(v)}</span>
              </div>
            )
          })}
        </section>
      </div>
    </>
  )
}
