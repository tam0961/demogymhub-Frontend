import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtMoney } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { Button, Chip, Field, MoneyInput, PageHeader, Panel, Segmented, Select, type ChipTone } from '../components/ui'

type Row = {
  user_id: string; name: string; target: number; new_sales: number; renew_sales: number; total: number; pct: number; status: 'on_track' | 'off_track' | 'low'
  renew_share: number; new_contracts: number; renew_contracts: number; apv: number; leads: number; conversion: number
  sessions_done: number; sessions_week: number; booked: number; cancelled: number; attend_rate: number; cancel_rate: number
  clients: number; offtrack: number; renew_rate: number; frequency: number
}
type Day = { day: number; dow: number; sessions: number; cancelled: number; revenue: number }
type Data = {
  year: number; month: number; days_elapsed: number; days_in_month: number; rows: Row[]; history: { label: string; actual: number; target: number }[]; prev: { total: number; new_sales: number; renew_sales: number }; daily: Day[]; hours: { hour: number; util: number }[]
  off_track: { member: string; pt_name: string; days_absent: number }[]
}
type Target = { user_id: string; name: string; target: number }

const STATUS: Record<Row['status'], { label: string; tone: ChipTone; color: string }> = {
  on_track: { label: 'On track', tone: 'ok', color: 'var(--ok)' },
  off_track: { label: 'Off track', tone: 'warn', color: 'var(--warn)' },
  low: { label: 'Rất thấp', tone: 'bad', color: 'var(--bad)' },
}
const pc = (n: number) => `${Math.round(n * 100)}%`
const tr = (n: number) => `${(n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`

const score = (r: Row) => {
  const sales = 50 * (Math.min(r.pct, 1) * 0.6 + Math.min(r.conversion / 0.35, 1) * 0.4)
  const train = 50 * (Math.min(r.renew_rate / 0.6, 1) * 0.4 + Math.min(r.frequency / 2, 1) * 0.3 + (1 - Math.min(r.cancel_rate / 0.2, 1)) * 0.3)
  return { sales, train, total: sales + train }
}
const level = (u: number) => (u >= 90 ? { c: 'var(--bad)', l: 'Kín lịch' } : u >= 70 ? { c: 'var(--warn)', l: 'Cao' } : u >= 40 ? { c: 'var(--ok)', l: 'Vừa' } : { c: 'var(--muted)', l: 'Thấp' })

function Spark({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <div style={{ height: 44 }} />
  const max = Math.max(1, ...data)
  const W = 160
  const H = 44
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - 4 - (v / max) * (H - 10)}`)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={44} aria-hidden="true">
      <polyline points={`0,${H} ${pts.join(' ')} ${W},${H}`} fill={color} opacity={0.15} stroke="none" />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={2} />
    </svg>
  )
}

function Stat({ label, value, note, delta, data, color, bar }: { label: string; value: string; note?: string; delta?: number; data?: number[]; color?: string; bar?: number }) {
  return (
    <div className="kpi2 wp-stat">
      <div className="kpi2-label">{label}</div>
      <div className="wp-stat-row">
        <div>
          <div className="kpi2-value">{value}</div>
          {delta != null && <div className={`kpi2-note ${delta >= 0 ? 'wp-up' : 'text-bad'}`}>{delta >= 0 ? '↑' : '↓'} {Math.abs(delta)}% so với tháng trước</div>}
          {note && <div className="kpi2-note">{note}</div>}
        </div>
        {data && color && <div className="wp-stat-spark"><Spark data={data} color={color} /></div>}
      </div>
      {bar != null && <div className="wp-seg" style={{ marginTop: 10 }}><i style={{ width: `${Math.min(100, bar * 100)}%`, background: bar >= 1 ? 'var(--ok)' : 'var(--c2)' }} /></div>}
    </div>
  )
}

function AreaChart({ days, total }: { days: Day[]; total: number }) {
  const W = 760
  const H = 200
  const L = 34
  const max = Math.max(10, Math.ceil(Math.max(...days.map((x) => x.sessions), 1) / 5) * 5)
  const x = (i: number) => L + (i / Math.max(1, total - 1)) * (W - L - 8)
  const y = (v: number) => H - 22 - (v / max) * (H - 36)
  const line = days.map((d, i) => `${x(i)},${y(d.sessions)}`).join(' ')
  const canc = days.map((d, i) => `${x(i)},${y(d.cancelled)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Buổi dạy theo ngày">
      {[0, 0.25, 0.5, 0.75, 1].map((t) => <g key={t}><line x1={L} x2={W - 8} y1={y(max * t)} y2={y(max * t)} stroke="var(--line)" /><text x={L - 6} y={y(max * t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{Math.round(max * t)}</text></g>)}
      {days.length > 1 && <polygon points={`${x(0)},${y(0)} ${line} ${x(days.length - 1)},${y(0)}`} fill="var(--c2)" opacity={0.15} />}
      <polyline points={line} fill="none" stroke="var(--c2)" strokeWidth={2} />
      <polyline points={canc} fill="none" stroke="var(--bad)" strokeWidth={2} strokeDasharray="4 3" />
      {Array.from({ length: total }, (_, i) => i).filter((i) => i % 3 === 0 || i === total - 1).map((i) => <text key={i} x={x(i)} y={H - 4} textAnchor="middle" fontSize="11" fill="var(--muted)">{i + 1}</text>)}
    </svg>
  )
}

function KpiModal({ year, month, onClose, onSaved }: { year: number; month: number; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [rows, setRows] = useState<Target[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    api.get<{ data: Target[] }>('/reports/work/targets', { params: { year, month } }).then((r) => setRows(r.data.data)).catch((e) => setErr(apiError(e).message))
  }, [year, month])
  const save = async () => {
    setBusy(true)
    setErr('')
    try {
      await api.put('/reports/work/targets', { targets: rows.map((r) => ({ user_id: r.user_id, target: r.target })) }, { params: { year, month } })
      toast(`Đã lưu KPI tháng ${month}/${year}`)
      onSaved()
      onClose()
    } catch (e) {
      setErr(apiError(e).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title={`Thiết lập KPI tháng ${month}/${year}`}
      onClose={onClose}
      footer={<><Button onClick={onClose} disabled={busy}>Hủy</Button><Button variant="primary" onClick={save} disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu KPI'}</Button></>}
    >
      {err && <div className="form-error" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="hint-muted" style={{ marginBottom: 10 }}>Chỉ tiêu doanh số PT (New + Renew) của từng PT trong tháng này.</div>
      {rows.map((r, i) => (
        <Field key={r.user_id} label={r.name} htmlFor={`kpi-${r.user_id}`}>
          <MoneyInput id={`kpi-${r.user_id}`} value={r.target} onValueChange={(v) => setRows((x) => x.map((y, j) => (j === i ? { ...y, target: Number(v || 0) } : y)))} />
        </Field>
      ))}
    </Modal>
  )
}

export default function WorkPerformance() {
  const { branchId } = useBranch()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [d, setD] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [kpi, setKpi] = useState(false)
  const [tab, setTab] = useState<'sales' | 'score' | 'train'>('sales')

  const load = useCallback(() => {
    api.get<{ data: Data }>('/reports/work', { params: { year, month, branch_id: branchId ?? undefined } })
      .then((r) => { setD(r.data.data); setError('') })
      .catch((e) => setError(apiError(e).message))
  }, [year, month, branchId])
  useEffect(() => { load() }, [load])

  const years = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()]
  const picker = (
    <span className="rep-ctl">
      <Select aria-label="Tháng" value={month} onChange={(e) => setMonth(Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>)}</Select>
      <Select aria-label="Năm" value={year} onChange={(e) => setYear(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</Select>
    </span>
  )

  if (error) return <div className="empty" role="alert">{error}</div>
  if (!d) return <div className="loading">Đang tải...</div>
  const T = d.rows.reduce((a, r) => ({ target: a.target + r.target, total: a.total + r.total, newS: a.newS + r.new_sales, renewS: a.renewS + r.renew_sales, leads: a.leads + r.leads, newC: a.newC + r.new_contracts, renewC: a.renewC + r.renew_contracts, clients: a.clients + r.clients, off: a.off + r.offtrack }), { target: 0, total: 0, newS: 0, renewS: 0, leads: 0, newC: 0, renewC: 0, clients: 0, off: 0 })
  const hist = [...d.history, { label: `T${month}`, actual: T.total, target: T.target }]
  const maxH = Math.max(1, ...hist.map((h) => Math.max(h.actual, h.target)))
  const prevPct = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / prev) * 100) : 0)
  const withScore = d.rows.map((r) => ({ r, s: score(r) }))
  const rankVal = (x: { r: Row; s: ReturnType<typeof score> }) => (tab === 'sales' ? x.r.total : tab === 'score' ? x.s.total : x.s.train)
  const ranked = [...withScore].sort((a, b) => rankVal(b) - rankVal(a))
  const rankMax = Math.max(1, ...ranked.map(rankVal))
  const teamScore = withScore.length ? withScore.reduce((t, x) => t + x.s.total, 0) / withScore.length : 0
  const teamLabel = teamScore >= 85 ? 'Xuất sắc' : teamScore >= 70 ? 'Tốt' : teamScore >= 50 ? 'Cần theo dõi' : 'Cần cải thiện'
  const weak = d.rows.filter((r) => r.pct < 0.8 || r.conversion < 0.2)
  const highCancel = d.rows.filter((r) => r.cancel_rate > 0.08)
  const great = withScore.filter((x) => x.s.total >= 80)
  const advice = (r: Row) => (r.pct < 0.8 ? 'Tăng cường đào tạo Sales' : r.cancel_rate > 0.08 ? 'Cải thiện tỷ lệ hủy lịch' : r.renew_rate < 0.3 ? 'Chăm sóc khách để tăng tái ký' : 'Duy trì phong độ')
  const attention = withScore.filter((x) => x.s.total < 70).sort((a, b) => a.s.total - b.s.total)
  const goDetail = () => document.getElementById('wp-detail')?.scrollIntoView({ behavior: 'smooth' })
  const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7
  const maxCanc = Math.max(1, ...d.daily.map((x) => x.cancelled))
  const donutR = 62
  const donutC = 2 * Math.PI * donutR
  const renewShare = T.total ? T.renewS / T.total : 0
  const initials = (n: string) => n.split(' ').slice(-2).map((w) => w[0]).join('').toUpperCase()

  return (
    <>
      <PageHeader title="Hiệu suất làm việc" sub="Hiệu suất đội ngũ Personal Trainer." action={<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{picker}<Button variant="primary" onClick={() => setKpi(true)}>Thiết lập KPI</Button></div>} />

      <div className="wp-stats">
        <Stat label="Tổng doanh số PT" value={tr(T.total)} delta={prevPct(T.total, d.prev.total)} data={d.daily.map((x) => x.revenue)} color="var(--c2)" />
        <Stat label="Tỷ lệ hoàn thành KPI" value={pc(T.target ? T.total / T.target : 0)} note={`${tr(T.total)} / ${tr(T.target)}`} bar={T.target ? T.total / T.target : 0} />
        <Stat label="Doanh số ký mới" value={tr(T.newS)} delta={prevPct(T.newS, d.prev.new_sales)} data={d.daily.map((x) => x.sessions)} color="var(--c3)" />
        <Stat label="Doanh số tái ký" value={tr(T.renewS)} delta={prevPct(T.renewS, d.prev.renew_sales)} data={d.daily.map((x) => x.revenue / 1e6)} color="var(--c1)" />
      </div>

      <div className="wp-grid">
        <Panel title="Doanh số và chỉ tiêu 12 tháng">
          <div className="wp-legend"><span><i style={{ background: 'var(--c2)' }} />Doanh số thực tế</span><span><i style={{ background: 'var(--muted)', height: 3, borderRadius: 2 }} />Chỉ tiêu</span></div>
          <div className="wp-hist">
            {hist.map((h, i) => (
              <div key={i} className="wp-hist-col" title={`${h.label}: ${fmtMoney(h.actual)} / chỉ tiêu ${fmtMoney(h.target)}`}>
                <div className="wp-hist-plot">
                  <i style={{ height: `${(h.actual / maxH) * 100}%`, background: i === hist.length - 1 ? 'var(--c2)' : 'color-mix(in srgb, var(--c2) 55%, white)' }} />
                  <b style={{ bottom: `${(h.target / maxH) * 100}%` }} />
                </div>
                <span>{h.label}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Bảng xếp hạng PT">
          <div style={{ padding: '4px 20px 16px' }}>
            <div style={{ marginBottom: 6 }}><Segmented<'sales' | 'score' | 'train'> ariaLabel="Xếp hạng theo" value={tab} onChange={setTab} options={[{ value: 'sales', label: 'Doanh số' }, { value: 'score', label: 'Tổng điểm' }, { value: 'train', label: 'Training' }]} /></div>
            {ranked.map((x, i) => (
              <div key={x.r.user_id} className="wp-rank">
                <span className="wp-rank-n">{i + 1}</span>
                <span className="wp-avatar">{initials(x.r.name)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="wp-rank-name">{x.r.name}</div>
                  <div className="wp-seg"><i style={{ width: `${(rankVal(x) / rankMax) * 100}%`, background: 'var(--c2)' }} /></div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <b>{tab === 'sales' ? tr(x.r.total) : `${Math.round(rankVal(x))}${tab === 'train' ? '/50' : ''}`}</b>
                  <div className="wp-pill">{tab === 'sales' ? pc(x.r.pct) : Math.round(x.s.total)}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="wp-grid3" style={{ marginTop: 16 }}>
        <Panel title="Ma trận đánh giá Sales × Training">
          <div style={{ padding: '4px 16px 16px' }}>
            <div className="wp-matrix">
              <div className="wp-q wp-q-tl"><b>Phát triển</b></div>
              <div className="wp-q wp-q-tr"><b>Xuất sắc</b></div>
              <div className="wp-q wp-q-bl"><b>Cần cải thiện</b></div>
              <div className="wp-q wp-q-br"><b>Ổn định</b></div>
              {withScore.map((x) => (
                <span key={x.r.user_id} className="wp-dotpt" title={`${x.r.name}: Sales ${Math.round(x.s.sales)}/50, Training ${Math.round(x.s.train)}/50`} style={{ left: `${Math.min(94, Math.max(6, (x.s.sales / 50) * 100))}%`, bottom: `${Math.min(92, Math.max(8, (x.s.train / 50) * 100))}%` }}>
                  <em>{x.r.name.split(' ').slice(-1)[0]}</em>
                </span>
              ))}
            </div>
            <div className="hint-muted" style={{ fontSize: 12, marginTop: 6 }}>Ngang: điểm Sales. Dọc: điểm Training. Mốc chia là 25/50 điểm mỗi trục.</div>
          </div>
        </Panel>
        <Panel title="Cảnh báo và đề xuất">
          <div style={{ padding: '0 20px 14px' }}>
            <div className="wp-alert"><i className="wp-dot wp-dot-l" style={{ background: 'var(--bad)' }} /><div style={{ flex: 1 }}><b>{weak.length} PT cần cải thiện hiệu suất</b><div className="cell-sub">Doanh số dưới 80% chỉ tiêu hoặc chuyển đổi dưới 20%</div></div><button type="button" className="wp-link" onClick={goDetail}>Xem chi tiết</button></div>
            <div className="wp-alert"><i className="wp-dot wp-dot-l" style={{ background: 'var(--warn)' }} /><div style={{ flex: 1 }}><b>{highCancel.length} PT có tỷ lệ hủy lịch cao</b><div className="cell-sub">Trên 8% trong tháng này</div></div><button type="button" className="wp-link" onClick={goDetail}>Xem chi tiết</button></div>
            <div className="wp-alert"><i className="wp-dot wp-dot-l" style={{ background: 'var(--ok)' }} /><div style={{ flex: 1 }}><b>{great.length} PT đạt điểm xuất sắc</b><div className="cell-sub">Từ 80 điểm trở lên, duy trì phong độ</div></div><button type="button" className="wp-link" onClick={goDetail}>Xem chi tiết</button></div>
          </div>
        </Panel>
        <Panel title="Cơ cấu doanh số">
          <div className="wp-donut">
            <svg viewBox="0 0 160 160" width="150" height="150" role="img" aria-label="Cơ cấu doanh số">
              <circle cx="80" cy="80" r={donutR} fill="none" stroke="var(--c2)" strokeWidth="22" />
              <circle cx="80" cy="80" r={donutR} fill="none" stroke="var(--c1)" strokeWidth="22" strokeDasharray={`${donutC * renewShare} ${donutC}`} transform="rotate(-90 80 80)" />
              <text x="80" y="86" textAnchor="middle" fontSize="20" fontWeight="700" fill="var(--ink)">{tr(T.total)}</text>
            </svg>
            <div className="wp-donut-leg">
              <span><i style={{ background: 'var(--c2)' }} />Ký mới <b>{pc(1 - renewShare)}</b></span>
              <span><i style={{ background: 'var(--c1)' }} />Tái ký <b>{pc(renewShare)}</b></span>
              <span className="hint-muted" style={{ fontSize: 12 }}>Chuẩn tái ký: 40 đến 50%</span>
            </div>
          </div>
        </Panel>
      </div>

      <div className="wp-grid" style={{ marginTop: 16 }}>
        <Panel title="Danh sách PT cần chú ý">
          <div className="table-wrap">
            <table className="table wp-table">
              <thead><tr><th className="col-left">PT</th><th>Tổng điểm</th><th>Doanh số</th><th>Chuyển đổi</th><th>Tái ký</th><th>Trạng thái</th><th className="col-left">Đề xuất</th></tr></thead>
              <tbody>
                {attention.length === 0 && <tr><td colSpan={7} className="hint-muted" style={{ textAlign: 'center' }}>Không có PT nào cần chú ý.</td></tr>}
                {attention.map((x) => (
                  <tr key={x.r.user_id}>
                    <td className="col-left"><b>{x.r.name}</b></td>
                    <td className="num"><b>{Math.round(x.s.total)}</b></td>
                    <td className="num">{tr(x.r.total)}</td>
                    <td className="num">{pc(x.r.conversion)}</td>
                    <td className="num">{pc(x.r.renew_rate)}</td>
                    <td><Chip tone={x.s.total < 50 ? 'bad' : 'warn'}>{x.s.total < 50 ? 'Cần cải thiện' : 'Theo dõi'}</Chip></td>
                    <td className="col-left">{advice(x.r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <div className="wp-team">
          <div className="wp-team-t">Điểm đánh giá đội ngũ</div>
          <div className="wp-team-n">{teamScore.toFixed(1)}<span> / 100</span></div>
          <div className="wp-team-l">{teamLabel}</div>
          <div className="hint-muted" style={{ fontSize: 12, marginTop: 8 }}>Trung bình điểm tổng của {d.rows.length} PT.</div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <Panel title="Công suất buổi dạy theo khung giờ" note="Tỷ lệ lấp đầy lịch PT trong ngày, trung bình cả tháng.">
          <div className="wp-legend">
            {[['Thấp (dưới 40%)', 'var(--muted)'], ['Vừa (40 đến 70%)', 'var(--ok)'], ['Cao (70 đến 90%)', 'var(--warn)'], ['Kín lịch (từ 90%)', 'var(--bad)']].map(([l, c]) => <span key={l}><i style={{ background: c }} />{l}</span>)}
          </div>
          <div className="wp-hours">
            {d.hours.map((h) => {
              const lv = level(h.util)
              return (
                <div key={h.hour} className="wp-hour">
                  <div className="wp-hour-t">{h.hour}:00 <i className="wp-dot" style={{ background: lv.c }} title={lv.l} /></div>
                  <b>{h.util}%</b>
                  <div className="wp-hour-bar"><i style={{ width: `${h.util}%`, background: lv.c }} /></div>
                </div>
              )
            })}
          </div>
          <div style={{ padding: '4px 20px 6px', fontWeight: 600, fontSize: 13 }}>Buổi dạy theo ngày <span className="hint-muted" style={{ fontWeight: 400 }}>(xanh: đã dạy, đỏ nét đứt: hủy)</span></div>
          <div style={{ padding: '0 20px 16px' }}><AreaChart days={d.daily} total={d.days_in_month} /></div>
        </Panel>
      </div>

      <div className="wp-grid2" style={{ marginTop: 16 }}>
        <Panel title="Chất lượng tập luyện và giữ chân khách hàng">
          <div className="wp-rows">
            {d.rows.map((r) => (
              <div key={r.user_id} className="wp-row">
                <div className="wp-row-name">{r.name}</div>
                <div style={{ flex: 1 }}>
                  <div className="wp-seg" title={`${r.clients - r.offtrack} đang tập đều, ${r.offtrack} off track`}><i style={{ width: `${((r.clients - r.offtrack) / Math.max(1, r.clients)) * 100}%`, background: 'var(--ok)' }} /><i style={{ width: `${(r.offtrack / Math.max(1, r.clients)) * 100}%`, background: 'var(--bad)' }} /></div>
                  <div className="hint-muted" style={{ fontSize: 12 }}>{r.clients} khách PT, {r.offtrack} off track, tái ký {pc(r.renew_rate)}, {r.frequency.toFixed(1)} buổi/khách/tuần</div>
                </div>
              </div>
            ))}
          </div>
          <div className="wp-legend"><span><i style={{ background: 'var(--ok)' }} />Đang tập đều</span><span><i style={{ background: 'var(--bad)' }} />Off track quá 14 ngày</span></div>
        </Panel>
        <Panel title="Lịch hủy buổi trong tháng" note="Mỗi ô là một ngày. Đậm hơn là hủy nhiều hơn.">
          <div className="wp-cal">
            {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((x) => <span key={x} className="wp-cal-h">{x}</span>)}
            {Array.from({ length: firstDow }, (_, i) => <span key={`e${i}`} />)}
            {Array.from({ length: d.days_in_month }, (_, i) => {
              const c = d.daily[i]?.cancelled ?? 0
              return <span key={i} className="wp-cal-d" title={`Ngày ${i + 1}: ${c} buổi hủy`} style={{ background: c === 0 ? 'var(--surface-2)' : `color-mix(in srgb, var(--bad) ${25 + (c / maxCanc) * 65}%, white)` }}>{i + 1}</span>
            })}
          </div>
        </Panel>
      </div>

      <div id="wp-detail" style={{ marginTop: 16 }}>
        <Panel title="Chi tiết theo PT" className="wp-detail-anchor">
          <div className="table-wrap">
            <table className="table wp-table">
              <thead>
                <tr><th className="col-left">PT</th><th>Thực đạt / Chỉ tiêu</th><th>% đạt</th><th>Trạng thái</th><th>Renew</th><th>HĐ New</th><th>Giá trị TB / HĐ</th><th>Lead MKT</th><th>Chuyển đổi</th><th>Buổi dạy (tháng)</th><th>TB tuần</th><th>Tổng đặt</th><th>Hủy</th><th>Tỷ lệ hủy</th><th>Điểm</th></tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.user_id}>
                    <td className="col-left"><b>{r.name}</b></td>
                    <td className="num">{tr(r.total)} / {tr(r.target)}</td>
                    <td className="num"><b>{pc(r.pct)}</b></td>
                    <td><Chip tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Chip></td>
                    <td className="num">{pc(r.renew_share)}</td>
                    <td className="num">{r.new_contracts}</td>
                    <td className="num">{r.new_contracts ? tr(r.apv) : '-'}</td>
                    <td className="num">{r.leads}</td>
                    <td className="num">{pc(r.conversion)}</td>
                    <td className="num">{r.sessions_done}</td>
                    <td className="num">{r.sessions_week}</td>
                    <td className="num">{r.booked}</td>
                    <td className="num">{r.cancelled}</td>
                    <td className="num"><span className={r.cancel_rate > 0.08 ? 'text-bad' : ''}>{pc(r.cancel_rate)}</span></td>
                    <td className="num"><b>{Math.round(score(r).total)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hint-muted" style={{ padding: '8px 20px 14px' }}>Lead = khách tiềm năng Marketing giao cho PT (dữ liệu mẫu, sẽ đấu nối sau). Hủy trên 8% hiện màu đỏ.</div>
        </Panel>
      </div>

      <div style={{ marginTop: 16 }}>
        <Panel title="Khách PT off track" count={d.off_track.length} note="Khách PT không đi tập quá 14 ngày.">
          <div className="table-wrap">
            <table className="table wp-table">
              <thead><tr><th className="col-left">Khách</th><th className="col-left">PT phụ trách</th><th>Số ngày vắng</th></tr></thead>
              <tbody>
                {d.off_track.map((o, i) => (
                  <tr key={i}><td className="col-left">{o.member}</td><td className="col-left">{o.pt_name}</td><td className="num text-bad">{o.days_absent} ngày</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {kpi && <KpiModal year={year} month={month} onClose={() => setKpi(false)} onSaved={load} />}
    </>
  )
}
