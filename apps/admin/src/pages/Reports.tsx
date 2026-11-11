import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { METHODS, METHOD_LABEL, barLayout, daysLeftText, fmtDate, fmtMoney } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import { Chip, EmptyState, Kpi, KpiRow, PageHeader, Panel } from '../components/ui'
import type { Contract, Dashboard, ListResp } from '../types'

const CH = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)']

export function RevenueBars({ data }: { data: { date: string; amount: number }[] }) {
  const H = 160
  const hs = barLayout(data.map((d) => d.amount), H)
  const W = 64
  return (
    <svg className="chart" viewBox={`0 0 ${data.length * W} ${H + 40}`} role="img" aria-label="Doanh thu 7 ngày gần nhất">
      {[0, 0.5, 1].map((t) => <line key={t} x1={0} x2={data.length * W} y1={H - H * t} y2={H - H * t} stroke="var(--line)" strokeWidth={1} />)}
      {data.map((d, i) => (
        <g key={d.date} transform={`translate(${i * W},0)`}>
          <rect x={10} y={H - hs[i]} width={W - 20} height={hs[i]} rx={4} fill={CH[0]}><title>{`${d.date}: ${fmtMoney(d.amount)}`}</title></rect>
          <text x={W / 2} y={H + 18} textAnchor="middle" fontSize="12" fill="var(--muted)">{d.date.slice(8, 10)}/{d.date.slice(5, 7)}</text>
        </g>
      ))}
    </svg>
  )
}

export function Donut({ parts }: { parts: { label: string; value: number }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0)
  const R = 54
  const C = 2 * Math.PI * R
  let acc = 0
  return (
    <svg className="donut" viewBox="0 0 140 140" role="img" aria-label="Doanh thu theo hình thức thanh toán">
      <circle cx={70} cy={70} r={R} fill="none" stroke="var(--surface-2)" strokeWidth={22} />
      {total > 0 && parts.map((p, i) => {
        const len = (p.value / total) * C
        const el = <circle key={p.label} cx={70} cy={70} r={R} fill="none" stroke={CH[i % CH.length]} strokeWidth={22} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)"><title>{`${p.label}: ${fmtMoney(p.value)}`}</title></circle>
        acc += len
        return el
      })}
      <text x={70} y={74} textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--ink)">{total > 0 ? fmtMoney(total) : 'Chưa có'}</text>
    </svg>
  )
}

export default function Reports() {
  const { branchId } = useBranch()
  const [d, setD] = useState<Dashboard | null>(null)
  const [expiring, setExpiring] = useState<Contract[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/reports/dashboard', { params: { branch_id: branchId ?? undefined } })
      .then((r) => { setD(r.data.data); setError('') })
      .catch((e) => setError(apiError(e).message))
    api.get<ListResp<Contract>>('/contracts', { params: { status: 'active', expiring_within_days: 7, branch_id: branchId ?? undefined, page: 1, limit: 8 } })
      .then((r) => setExpiring(r.data.data))
      .catch(() => setExpiring([]))
  }, [branchId])

  if (error) return <div className="empty" role="alert">{error}</div>
  if (!d) return <div className="loading">Đang tải...</div>

  const parts = METHODS.map((m) => ({ label: METHOD_LABEL[m], value: d.revenue_by_method[m] ?? 0 }))
  const total = parts.reduce((s, p) => s + p.value, 0)

  return (
    <>
      <PageHeader title="Hiệu suất kinh doanh" sub="Số liệu hôm nay và 7 ngày gần nhất" action={<Link className="btn" to="/reports/closing">Chốt ngày</Link>} />
      <KpiRow>
        <Kpi value={fmtMoney(d.revenue_today)} label="Doanh thu hôm nay" />
        <Kpi value={d.new_contracts_today} label="Hợp đồng mới" />
        <Kpi value={d.active_members} label="Hội viên đang hiệu lực" />
        <Kpi value={d.expiring_in_7_days} label="Sắp hết hạn (7 ngày)" />
        <Kpi value={d.checkins_today} label="Lượt check-in" />
        <Kpi value={<span className={d.debt_total > 0 ? 'text-bad' : ''}>{fmtMoney(d.debt_total)}</span>} label="Công nợ" />
      </KpiRow>
      <div className="grid-2">
        <Panel title="Doanh thu 7 ngày" note={fmtMoney(d.revenue_7d.reduce((s, x) => s + x.amount, 0))}>
          <RevenueBars data={d.revenue_7d} />
        </Panel>
        <Panel title="Doanh thu theo hình thức" note={fmtMoney(total)}>
          <div className="donut-wrap">
            <Donut parts={parts} />
            <ul className="legend">
              {parts.map((p, i) => (
                <li key={p.label}>
                  <span className="swatch" style={{ background: CH[i] }} aria-hidden="true" />
                  <span>{p.label}</span>
                  <b className="num">{fmtMoney(p.value)}</b>
                  <span className="hint-muted">{total ? Math.round((p.value / total) * 100) : 0}%</span>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>
      <div className="grid-2" style={{ marginTop: 16 }}>
        <Panel title="Sắp hết hạn trong 7 ngày" count={`${d.expiring_in_7_days} hợp đồng`} flush>
          {expiring.length === 0 && <EmptyState title="Không có hợp đồng sắp hết hạn" />}
          {expiring.map((c) => (
            <Link key={c.id} to={`/contracts/${c.id}`} className="recent link-row-item">
              <div className="recent-main">
                <div className="cell-main">{c.member.name}</div>
                <div className="cell-sub">{c.code} - {c.package.name}</div>
              </div>
              <div className="num"><div className="cell-main">{fmtDate(c.end_date)}</div><Chip tone="warn">{daysLeftText(c.end_date)}</Chip></div>
            </Link>
          ))}
        </Panel>
        <Panel title="Đi tới">
          <ul className="quick-links">
            <li><Link to="/debt">Công nợ: {fmtMoney(d.debt_total)}</Link></li>
            <li><Link to="/payments">Phiếu thu</Link></li>
            <li><Link to="/contracts">Hợp đồng</Link></li>
            <li><Link to="/reports/closing">Chốt ngày</Link></li>
          </ul>
        </Panel>
      </div>
    </>
  )
}
