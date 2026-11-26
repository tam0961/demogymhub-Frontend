import { gradeTone } from './OpsStats'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDate, fmtMoney, fmtTr } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import { BranchTag, Chip, EmptyState, PageHeader, Panel, Segmented, Select, type ChipTone } from '../components/ui'

type Kind = 'member' | 'pt' | 'group'
interface Row { label: number; member: number; pt: number; group: number }
interface ByBranch { branch: string; code: string; count: number }
interface Card { total: number; by_branch: ByBranch[]; spark: number[]; members?: number }
interface Business {
  mode: 'month' | 'year'
  year: number
  month: number
  revenue: { total: number; rows: Row[] }
  collected: { total: number; rows: Row[] }
  cards: { member_active: Card; expiring_7: Card; pt_active: Card }
  packages: { total: number; rows: { name: string; group?: 'member' | 'pt' | 'group'; contracts: number; share: number }[] }
  health: { score: number; grade: string; parts: { key: string; label: string; score: number }[] }
  alerts: {
    expiring_30: { count: number; impact: number }
    unsigned: { count: number; impact: number }
    debt: { count: number; impact: number }
    refund_pending: { count: number; impact: number }
    renew_rate: number | null
  }
  recent_contracts: { id: string; code: string; status: 'draft' | 'signed' | 'active' | 'frozen' | 'expired'; total_amount: number; created_at: string; package: string; member: { name: string; code: string }; branch: { code: string; name: string } | null }[]
  expiring_list: { id: string; member: { id: string; name: string }; package: string; end_date: string; days_left: number; branch: { code: string; name: string } | null }[]
  activity: { type: 'checkin' | 'payment' | 'lead'; at: string; text: string }[]
}
interface Services { total: number; groups: { key: 'gym' | 'pt' | 'group'; revenue: number }[] }

const KINDS: { key: Kind; label: string; color: string }[] = [
  { key: 'member', label: 'Member', color: 'var(--c2)' },
  { key: 'pt', label: 'PT', color: 'var(--c3)' },
  { key: 'group', label: 'Lớp nhóm', color: 'var(--c4)' },
]
const CH = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)']
const STATUS: Record<string, { label: string; tone: ChipTone }> = {
  active: { label: 'Còn hạn', tone: 'ok' },
  frozen: { label: 'Bảo lưu', tone: 'neutral' },
  draft: { label: 'Chờ ký', tone: 'warn' },
  signed: { label: 'Chưa kích hoạt', tone: 'warn' },
  expired: { label: 'Hết hạn', tone: 'bad' },
}
const compact = (n: number) => (Math.abs(n) >= 1e6 ? fmtTr(n) : fmtMoney(n))
const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')}%`
const ago = (iso: string) => {
  const d = new Date(iso)
  const today = new Date()
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (d.toDateString() === today.toDateString()) return `Hôm nay ${hm}`
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hm}`
}

export function Donut({ parts, center, label }: { parts: { label: string; value: number }[]; center: string; label?: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0)
  const R = 54
  const C = 2 * Math.PI * R
  let acc = 0
  return (
    <svg className="donut" viewBox="0 0 140 140" width={150} height={150} role="img" aria-label={label ?? 'Biểu đồ tròn'}>
      <circle cx={70} cy={70} r={R} fill="none" stroke="var(--surface-2)" strokeWidth={22} />
      {total > 0 && parts.map((p, i) => {
        const len = (p.value / total) * C
        const el = <circle key={p.label} cx={70} cy={70} r={R} fill="none" stroke={CH[i % CH.length]} strokeWidth={22} strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)"><title>{`${p.label}: ${p.value.toLocaleString('vi-VN')}`}</title></circle>
        acc += len
        return el
      })}
      <text x={70} y={76} textAnchor="middle" fontSize="16" fontWeight="700" fill="var(--ink)">{center}</text>
    </svg>
  )
}

function niceMax(v: number) {
  if (v <= 0) return 4
  const pow = 10 ** Math.floor(Math.log10(v))
  const n = v / pow
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : 10
  return Math.ceil(v / (step * pow / 4)) * (step * pow / 4)
}

const mil = (vnd: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(Math.trunc(vnd / 10000) / 100)

export function StackedBars({ rows, label }: { rows: Row[]; label: string }) {
  const W = 940
  const H = 220
  const left = 44
  const top = 18
  const slot = (W - left) / rows.length
  const totals = rows.map((r) => (r.member + r.pt + r.group) / 1e6)
  const max = niceMax(Math.max(...totals, 0))
  const y = (v: number) => top + H - (v / max) * H
  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i)
  return (
    <svg viewBox={`0 0 ${W} ${top + H + 30}`} role="img" aria-label={label} style={{ width: '100%', height: 'auto' }}>
      <text x={10} y={top + H / 2} transform={`rotate(-90 10 ${top + H / 2})`} textAnchor="middle" fontSize="11" fill="var(--muted)">Triệu đồng</text>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={left} x2={W} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
          <text x={left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{Number.isInteger(t) ? t : t.toFixed(1)}</text>
        </g>
      ))}
      {rows.map((r, i) => {
        let acc = 0
        const x = left + i * slot + slot * 0.08
        const w = slot * 0.84
        return (
          <g key={r.label}>
            {KINDS.map((k) => {
              const v = Math.max(0, r[k.key]) / 1e6
              if (v <= 0) return null
              const h = y(acc) - y(acc + v)
              const seg = (
                <g key={k.key}>
                  <rect x={x} y={y(acc + v)} width={w} height={h} fill={k.color}><title>{`${r.label}: ${k.label} ${fmtMoney(r[k.key])}`}</title></rect>
                  {h >= 11 && <text x={x + w / 2} y={y(acc + v) + h / 2 + 3} textAnchor="middle" fontSize="6.5" fill="#fff" style={{ pointerEvents: 'none' }}>{mil(r[k.key])}</text>}
                </g>
              )
              acc += v
              return seg
            })}
            <text x={x + w / 2} y={top + H + 16} textAnchor="middle" fontSize="11" fill="var(--muted)">{r.label}</text>
          </g>
        )
      })}
    </svg>
  )
}

function Legend() {
  return (
    <div className="ptg-legend" style={{ justifyContent: 'center' }}>
      {KINDS.map((k) => <span key={k.key}><i className="ptg-sw" style={{ background: k.color }} />{k.label}</span>)}
    </div>
  )
}

function Spark({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(1, ...data)
  const W = 300
  const H = 44
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * W},${H - 4 - (v / max) * (H - 10)}`)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={44} aria-hidden="true">
      <polyline points={`0,${H} ${pts.join(' ')} ${W},${H}`} fill={color} opacity={0.15} stroke="none" />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={2} />
    </svg>
  )
}

function StatCard({ value, label, card, color, note, ending }: { value: number; label: string; card: Card; color: string; note?: string; ending?: boolean }) {
  return (
    <div className="kpi2" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 18px 4px' }}>
        <div className="kpi2-label">{label}</div>
        <div className="kpi2-value">{value}</div>
        {card.by_branch.map((b) => <div key={b.code} className="kpi2-note"><BranchTag branch={{ code: b.code, name: b.branch }} /> {b.branch} {b.count}</div>)}
        {note && <div className="kpi2-note">{note}</div>}
      </div>
      <div style={{ marginTop: 'auto' }} title={ending ? 'Số hợp đồng hết hạn mỗi ngày trong 14 ngày tới' : '14 ngày gần nhất'}><Spark data={card.spark} color={color} /></div>
    </div>
  )
}

function Controls({ mode, year, month, onMode, onYear, onMonth, years }: { mode: 'month' | 'year'; year: number; month: number; onMode: (m: 'month' | 'year') => void; onYear: (y: number) => void; onMonth: (m: number) => void; years: number[] }) {
  return (
    <span className="rep-ctl">
      <Segmented<'month' | 'year'> ariaLabel="Xem theo" value={mode} onChange={onMode} options={[{ value: 'month', label: 'Theo tháng' }, { value: 'year', label: 'Theo năm' }]} />
      <Select aria-label="Tháng" value={month} onChange={(e) => onMonth(Number(e.target.value))} style={{ visibility: mode === 'month' ? 'visible' : 'hidden' }} disabled={mode !== 'month'}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}</Select>
      <Select aria-label="Năm" value={year} onChange={(e) => onYear(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</Select>
    </span>
  )
}

function Alert({ title, desc, impact, action, to }: { title: string; desc: string; impact?: number; action: string; to: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--line)', alignItems: 'flex-start' }}>
      <div>
        <b>{title}</b>
        <div className="cell-sub">{desc}</div>
        {impact != null && impact > 0 && <div className="text-bad" style={{ fontSize: 12, fontWeight: 600 }}>Ảnh hưởng khoảng {compact(impact)}</div>}
      </div>
      <Link className="btn" to={to} style={{ whiteSpace: 'nowrap' }}>{action}</Link>
    </div>
  )
}

export default function Reports() {
  const { branchId } = useBranch()
  const now = new Date()
  const [mode, setMode] = useState<'month' | 'year'>('month')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [d, setD] = useState<Business | null>(null)
  const [svc, setSvc] = useState<Services | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<{ data: Business }>('/reports/business', { params: { mode, year, month, branch_id: branchId ?? undefined } })
      .then((r) => { setD(r.data.data); setError('') })
      .catch((e) => setError(apiError(e).message))
  }, [mode, year, month, branchId])
  useEffect(() => {
    api.get<{ data: Services }>('/reports/revenue-services', { params: { days: 30, branch_id: branchId ?? undefined } })
      .then((r) => setSvc(r.data.data))
      .catch(() => setSvc(null))
  }, [branchId])

  const years = useMemo(() => [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()], [now])
  const controls = <Controls mode={mode} year={year} month={month} onMode={setMode} onYear={setYear} onMonth={setMonth} years={years} />

  if (error) return <div className="empty" role="alert">{error}</div>
  if (!d) return <div className="loading">Đang tải...</div>

  const A = d.alerts
  const grade = { label: d.health.grade, tone: gradeTone(d.health.grade) }
  const gymColor: Record<string, string> = { gym: 'var(--c1)', pt: 'var(--c2)', group: 'var(--c3)' }
  const svcLabel: Record<string, string> = { gym: 'Member', pt: 'PT', group: 'Lớp nhóm' }
  const GROUPS = [['member', 'Member'], ['pt', 'PT'], ['group', 'Lớp nhóm']] as const
  const pkRows = GROUPS.flatMap(([g]) => d.packages.rows.filter((r) => (r.group ?? 'member') === g).map((r) => ({ ...r, group: g })))
  const period = mode === 'month' ? `tháng ${month}/${year}` : `năm ${year}`

  return (
    <>
      <PageHeader title="Hiệu suất kinh doanh" sub="Tình hình phòng gym của bạn." action={<Link className="btn" to="/reports/closing">Chốt ngày</Link>} />

      <Panel title="Doanh thu" note={controls}>
        <div className="hint-muted" style={{ marginBottom: 8 }}>Tổng giá trị hợp đồng ký {period}: <b>{fmtMoney(d.revenue.total)}</b></div>
        <StackedBars rows={d.revenue.rows} label="Doanh thu theo kỳ" />
        <Legend />
      </Panel>
      <div style={{ marginTop: 16 }}>
        <Panel title="Thực thu" note={controls}>
          <div className="hint-muted" style={{ marginBottom: 8 }}>Tổng thực thu {period} (đã trừ tiền hoàn): <b>{fmtMoney(d.collected.total)}</b></div>
          <StackedBars rows={d.collected.rows} label="Thực thu theo kỳ" />
          <Legend />
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, margin: '16px 0' }}>
        <StatCard value={d.cards.member_active.total} label="Member Active" card={d.cards.member_active} color="var(--c2)" />
        <StatCard value={d.cards.expiring_7.total} label="Member sắp hết hạn" card={d.cards.expiring_7} color="var(--c4)" note="Hết hạn trong 7 ngày" ending />
        <StatCard value={d.cards.pt_active.total} label="Gói PT đang Active" card={d.cards.pt_active} color="var(--c1)" note={`${d.cards.pt_active.members} hội viên đang tập PT`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
        <Panel title="Nguồn doanh thu" note="Theo dịch vụ, 30 ngày qua">
          {svc && svc.total !== undefined ? (
            <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
              <Donut label="Nguồn doanh thu" center={compact(svc.total)} parts={svc.groups.map((g) => ({ label: svcLabel[g.key], value: Math.max(0, g.revenue) }))} />
              <ul className="plain-list" style={{ flex: 1, minWidth: 200 }}>
                {svc.groups.map((g) => (
                  <li key={g.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                    <span><i className="ptg-sw" style={{ background: gymColor[g.key], display: 'inline-block', marginRight: 8 }} />{svcLabel[g.key]}</span>
                    <b className="num">{fmtMoney(g.revenue)} <span className="hint-muted">{pct(svc.total > 0 ? g.revenue / svc.total : 0)}</span></b>
                  </li>
                ))}
              </ul>
            </div>
          ) : <EmptyState title="Chưa có số liệu" />}
        </Panel>
        <Panel title="Phân bố theo gói tập" note="Hợp đồng đang hiệu lực, theo từng gói">
          {d.packages.total === 0 ? <EmptyState title="Chưa có hợp đồng đang hiệu lực" /> : (
            <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
              <Donut label="Phân bố theo gói" center={`${d.packages.total} HĐ`} parts={pkRows.map((r) => ({ label: r.name, value: r.contracts }))} />
              <ul className="plain-list" style={{ flex: 1, minWidth: 200 }}>
                {GROUPS.map(([g, title]) => {
                  const part = pkRows.map((r, i) => ({ r, i })).filter((x) => x.r.group === g)
                  if (!part.length) return null
                  return (
                    <li key={g} style={{ listStyle: 'none' }}>
                      <div className="cell-sub" style={{ padding: '6px 0 2px', fontWeight: 700 }}>{title}: {part.reduce((a, x) => a + x.r.contracts, 0)} hợp đồng</div>
                      <ul className="plain-list">
                        {part.slice(0, 4).map(({ r, i }) => (
                          <li key={r.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
                            <span><i className="ptg-sw" style={{ background: CH[i % CH.length], display: 'inline-block', marginRight: 8 }} />{r.name}</span>
                            <span className="num">{r.contracts} hợp đồng <b>{pct(r.share)}</b></span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start', marginTop: 16 }}>
        <Panel title="Chỉ số sức khỏe" note="Tối đa 25 điểm mỗi nhóm">
          <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 48, fontWeight: 700, lineHeight: 1 }}>{d.health.score}<span className="hint-muted" style={{ fontSize: 18 }}>/100</span></div>
              <Chip tone={grade.tone}>{grade.label}</Chip>
            </div>
            <div style={{ flex: 1, minWidth: 220, display: 'grid', gap: 10 }}>
              {d.health.parts.map((p) => (
                <div key={p.key} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 48px', gap: 10, alignItems: 'center' }}>
                  <span>{p.label}</span>
                  <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}><div style={{ width: `${(p.score / 25) * 100}%`, height: '100%', background: 'var(--brand)' }} /></div>
                  <b className="num">{p.score}/25</b>
                </div>
              ))}
            </div>
          </div>
          <p className="hint-muted" style={{ marginTop: 12 }}>Điểm tính từ 4 nhóm: doanh thu 30 ngày so với trung bình 3 tháng trước, tỷ lệ hội viên còn hạn và tái ký, tiến độ thu tiền trên giá trị hợp đồng, và tỷ lệ hội viên có đi tập trong 14 ngày.</p>
        </Panel>
        <Panel title="Cảnh báo cần xử lý" note="Xếp theo mức ảnh hưởng doanh thu">
          {A.expiring_30.count > 0 && <Alert title={`${A.expiring_30.count} hợp đồng hết hạn trong 30 ngày`} desc="Nên nhắc gia hạn sớm cho hội viên sắp hết hạn." impact={A.expiring_30.impact} action="Xem hợp đồng" to="/expiring" />}
          {A.unsigned.count > 0 && <Alert title={`${A.unsigned.count} hợp đồng chưa ký hoặc chưa kích hoạt`} desc="Hội viên đã đăng ký nhưng chưa được vào tập." impact={A.unsigned.impact} action="Xem hợp đồng" to="/contracts" />}
          {A.debt.count > 0 && <Alert title={`${A.debt.count} hợp đồng còn nợ ${fmtMoney(A.debt.impact)}`} desc="Hội viên đang tập nhưng chưa thanh toán đủ." impact={A.debt.impact} action="Xem công nợ" to="/debt" />}
          {A.refund_pending.count > 0 && <Alert title={`${A.refund_pending.count} yêu cầu hoàn tiền đang chờ duyệt`} desc="Cần chủ phòng gym xác nhận." impact={A.refund_pending.impact} action="Xem phiếu thu" to="/payments" />}
          {A.renew_rate != null && (
            <div style={{ padding: '12px 0' }}>
              <b>Tỉ lệ tái ký {Math.round(A.renew_rate * 100)}%</b>
              <div className="cell-sub">Hợp đồng member hết hạn trong 90 ngày qua và đã được gia hạn.</div>
            </div>
          )}
          {A.expiring_30.count + A.unsigned.count + A.debt.count + A.refund_pending.count === 0 && A.renew_rate == null && <EmptyState title="Không có cảnh báo" />}
        </Panel>
      </div>

      <div style={{ marginTop: 16 }}>
        <Panel title="Hợp đồng gần đây" note={<Link className="btn" to="/contracts">Xem tất cả</Link>} flush>
          {d.recent_contracts.length === 0 ? <EmptyState title="Chưa có hợp đồng" /> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Mã HĐ</th><th>Hội viên</th><th>Dịch vụ</th><th>Chi nhánh</th><th>Ngày ký</th><th>Trạng thái</th><th className="num">Giá trị</th></tr></thead>
                <tbody>
                  {d.recent_contracts.map((c) => (
                    <tr key={c.id}>
                      <td><Link to={`/contracts/${c.id}`}>{c.code}</Link></td>
                      <td><span className="cell-main">{c.member.name}</span><div className="cell-sub">{c.member.code}</div></td>
                      <td>{c.package}</td>
                      <td><BranchTag branch={c.branch} /></td>
                      <td>{fmtDate(c.created_at)}</td>
                      <td><Chip tone={STATUS[c.status]?.tone ?? 'neutral'}>{STATUS[c.status]?.label ?? c.status}</Chip></td>
                      <td className="num">{fmtMoney(c.total_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start', marginTop: 16 }}>
        <Panel title="Sắp hết hạn trong 7 ngày" count={`${d.cards.expiring_7.total} hội viên cần gia hạn`} flush>
          {d.expiring_list.length === 0 && <EmptyState title="Không có hợp đồng sắp hết hạn" />}
          {d.expiring_list.map((c) => (
            <div key={c.id} className="recent" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
              <div>
                <div className="cell-main">{c.member.name}</div>
                <div className="cell-sub">Còn {c.days_left} ngày, {c.package}</div>
                <BranchTag branch={c.branch} />
              </div>
              <Link className="btn" to={`/contracts/new?member_id=${c.member.id}`}>Đăng ký mới</Link>
            </div>
          ))}
        </Panel>
        <Panel title="Hoạt động gần đây" note="Check-in, thanh toán, khách mới" flush>
          {d.activity.length === 0 && <EmptyState title="Chưa có hoạt động" />}
          {d.activity.map((a, i) => (
            <div key={i} style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 10 }}>
              <i className="ptg-sw" style={{ background: a.type === 'checkin' ? 'var(--ok)' : a.type === 'payment' ? 'var(--c3)' : 'var(--c4)', flex: 'none', marginTop: 4 }} />
              <div>
                <div className="cell-main">{a.text}</div>
                <div className="cell-sub">{ago(a.at)}</div>
              </div>
            </div>
          ))}
        </Panel>
      </div>
    </>
  )
}

