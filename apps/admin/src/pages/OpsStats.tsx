import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtMoney } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import { Chip, Kpi, KpiRow, PageHeader, Panel, type ChipTone } from '../components/ui'

interface Health { score: number; grade: string; parts: { key: string; label: string; score: number }[]; renew_rate: number | null }
interface AlertItem { key: string; label: string; count: number; impact: number; detail: string; tone: 'bad' | 'warn' }
interface Capacity {
  total_checkins: number
  avg_per_day: number
  heatmap: number[][]
  peak: { from_hour: number; to_hour: number; count: number } | null
  pt_funnel: { booked: number; attended: number; no_show: number; cancelled: number; completion_rate: number | null }
  day_tickets: { count: number; amount: number }
}

const DAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']
const HOURS = Array.from({ length: 24 }, (_, h) => h)
const LINKS: Record<string, string> = { expiring_30: '/expiring', debt: '/debt', unsigned: '/contracts', refund_pending: '/payments', renew_rate: '/expiring' }
export const gradeTone = (g: string): ChipTone => (g === 'Rất tốt' || g === 'Tốt' ? 'ok' : g === 'Trung bình' ? 'warn' : 'bad')
const pct = (x: number) => `${Math.round(x * 100)}%`
const hh = (h: number) => `${String(h % 24).padStart(2, '0')}:00`

export function Heatmap({ rows }: { rows: number[][] }) {
  const max = Math.max(1, ...rows.flat())
  const used = HOURS.filter((h) => rows.some((r) => r[h] > 0))
  const shown = used.length ? HOURS.slice(Math.max(0, used[0] - 1), Math.min(24, used[used.length - 1] + 2)) : HOURS.slice(5, 22)
  return (
    <div style={{ overflowX: 'auto' }}>
      <table aria-label="Bản đồ nhiệt check-in theo thứ và giờ" style={{ borderCollapse: 'separate', borderSpacing: 3, fontVariantNumeric: 'tabular-nums' }}>
        <thead>
          <tr>
            <th scope="col" style={{ textAlign: 'left' }}>Thứ</th>
            {shown.map((h) => <th key={h} scope="col" style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted)' }}>{h}h</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, d) => (
            <tr key={d}>
              <th scope="row" style={{ textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 600, paddingRight: 8 }}>{DAYS[d]}</th>
              {shown.map((h) => {
                const v = r[h]
                const label = `${DAYS[d]}, ${hh(h)}: ${v} lượt`
                return (
                  <td
                    key={h}
                    title={label}
                    aria-label={label}
                    style={{ minWidth: 30, height: 30, textAlign: 'center', fontSize: 12, borderRadius: 6, background: v ? `color-mix(in srgb, var(--brand) ${Math.max(12, Math.round((v / max) * 100))}%, var(--surface))` : 'var(--surface-2)', color: 'var(--ink)' }}
                  >{v || ''}</td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function OpsStats() {
  const { branchId } = useBranch()
  const [health, setHealth] = useState<Health | null>(null)
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [cap, setCap] = useState<Capacity | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const params = { branch_id: branchId ?? undefined }
    try {
      const [h, a, c] = await Promise.all([
        api.get<{ data: Health }>('/reports/health', { params }),
        api.get<{ data: AlertItem[] }>('/reports/alerts', { params }),
        api.get<{ data: Capacity }>('/reports/capacity', { params }),
      ])
      setHealth(h.data.data)
      setAlerts(a.data.data)
      setCap(c.data.data)
    } catch (e) {
      setError(apiError(e).message)
    } finally {
      setLoading(false)
    }
  }, [branchId])
  useEffect(() => { load() }, [load])

  const f = cap?.pt_funnel
  return (
    <>
      <PageHeader title="Sức khỏe và công suất" sub="Chỉ số sức khỏe, cảnh báo và công suất vận hành 30 ngày qua." />
      {error && <div className="form-error" role="alert">{error}</div>}
      {loading && !health && <p className="muted">Đang tải...</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
        {health && (
          <Panel title="Chỉ số sức khỏe" note="Tối đa 25 điểm mỗi nhóm">
            <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 48, fontWeight: 700, lineHeight: 1 }}>{health.score}<span className="hint-muted" style={{ fontSize: 18 }}>/100</span></div>
                <Chip tone={gradeTone(health.grade)}>{health.grade}</Chip>
              </div>
              <div style={{ flex: 1, minWidth: 220, display: 'grid', gap: 10 }}>
                {health.parts.map((p) => (
                  <div key={p.key} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 56px', gap: 10, alignItems: 'center' }}>
                    <span>{p.label}</span>
                    <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}><div style={{ width: `${(p.score / 25) * 100}%`, height: '100%', background: 'var(--brand)' }} /></div>
                    <b className="num">{String(p.score).replace('.', ',')}/25</b>
                  </div>
                ))}
              </div>
            </div>
            <p className="hint-muted" style={{ marginTop: 12 }}>Từ 80 là Rất tốt, từ 65 là Tốt, từ 50 là Trung bình, dưới 50 là Cần cải thiện. Tỉ lệ tái ký: {health.renew_rate == null ? 'chưa có dữ liệu, tạm tính 60%' : pct(health.renew_rate)}.</p>
          </Panel>
        )}
        {health && (
          <Panel title="Cảnh báo cần xử lý" note="Xếp theo mức ảnh hưởng doanh thu">
            {alerts.length === 0 && <p className="muted">Không có cảnh báo.</p>}
            {alerts.map((a) => (
              <div key={a.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                <div>
                  <b>{a.count} · {a.label}</b>
                  {a.detail && <div className="cell-sub">{a.detail}</div>}
                  <Link to={LINKS[a.key] ?? '/contracts'}>Xem chi tiết</Link>
                </div>
                <Chip tone={a.tone}>{fmtMoney(a.impact)}</Chip>
              </div>
            ))}
          </Panel>
        )}
      </div>
      {cap && f && (
        <>
          <div style={{ marginTop: 16 }}>
            <KpiRow>
              <Kpi value={cap.total_checkins} label="Lượt vào 30 ngày" />
              <Kpi value={String(cap.avg_per_day).replace('.', ',')} label="Trung bình mỗi ngày" />
              <Kpi value={cap.peak ? `${hh(cap.peak.from_hour)} - ${hh(cap.peak.to_hour)}` : '-'} label="Giờ cao điểm" note={cap.peak ? `${cap.peak.count} lượt` : undefined} />
              <Kpi value={f.completion_rate == null ? '-' : pct(f.completion_rate)} label="Buổi PT hoàn thành" />
              <Kpi value={cap.day_tickets.count} label="Vé lẻ" note={fmtMoney(cap.day_tickets.amount)} />
            </KpiRow>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start', marginTop: 16 }}>
            <Panel title="Check-in theo thứ và giờ" note="Số lượt vào trong 30 ngày">
              <Heatmap rows={cap.heatmap} />
            </Panel>
            <Panel title="Phễu buổi PT" note="30 ngày qua">
              <ul className="plain-list">
                {([['Đã đặt', f.booked], ['Có mặt', f.attended], ['Vắng mặt', f.no_show], ['Đã hủy', f.cancelled]] as const).map(([label, v]) => (
                  <li key={label} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 40px', gap: 10, alignItems: 'center', padding: '6px 0' }}>
                    <span>{label}</span>
                    <div style={{ height: 8, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}><div style={{ width: `${f.booked ? (v / f.booked) * 100 : 0}%`, height: '100%', background: label === 'Vắng mặt' ? 'var(--warn)' : label === 'Đã hủy' ? 'var(--bad)' : 'var(--c1)' }} /></div>
                    <b className="num">{v}</b>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </>
      )}
    </>
  )
}
