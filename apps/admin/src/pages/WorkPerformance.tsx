import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtMoney } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { Button, Chip, Field, MoneyInput, PageHeader, Panel, Select, type ChipTone } from '../components/ui'

type Row = {
  user_id: string; name: string; target: number; new_sales: number; renew_sales: number; total: number; pct: number; status: 'on_track' | 'off_track' | 'low'
  renew_share: number; new_contracts: number; renew_contracts: number; apv: number; leads: number; conversion: number
  sessions_done: number; sessions_week: number; booked: number; cancelled: number; attend_rate: number; cancel_rate: number
  clients: number; offtrack: number; renew_rate: number; frequency: number
}
type Data = { year: number; month: number; days_elapsed: number; days_in_month: number; rows: Row[]; off_track: { member: string; pt_name: string; days_absent: number }[] }
type Target = { user_id: string; name: string; target: number }

const STATUS: Record<Row['status'], { label: string; tone: ChipTone; color: string }> = {
  on_track: { label: 'On track', tone: 'ok', color: 'var(--ok)' },
  off_track: { label: 'Off track', tone: 'warn', color: 'var(--warn)' },
  low: { label: 'Rất thấp', tone: 'bad', color: 'var(--bad)' },
}
const pc = (n: number) => `${Math.round(n * 100)}%`
const tr = (n: number) => `${(n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`

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
          <MoneyInput id={`kpi-${r.user_id}`} value={r.target} onValueChange={(d) => setRows((x) => x.map((y, j) => (j === i ? { ...y, target: Number(d || 0) } : y)))} />
        </Field>
      ))}
    </Modal>
  )
}

function Progress({ r, pace }: { r: Row; pace: number }) {
  const w = (v: number) => `${Math.min(100, (v / Math.max(1, r.target)) * 100)}%`
  return (
    <div className="wp-bar" title={`New ${fmtMoney(r.new_sales)} | Renew ${fmtMoney(r.renew_sales)} | Chỉ tiêu ${fmtMoney(r.target)}`}>
      <i style={{ width: w(r.renew_sales), background: 'var(--c1)' }} />
      <i style={{ width: w(r.new_sales), background: 'var(--c2)' }} />
      <b style={{ left: `${Math.min(100, pace * 100)}%` }} />
    </div>
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
  const pace = d.days_elapsed / d.days_in_month

  return (
    <>
      <PageHeader title="Hiệu suất làm việc" sub="Đánh giá năng lực PT theo tháng." action={<Button variant="primary" onClick={() => setKpi(true)}>Thiết lập KPI</Button>} />

      <Panel title="Chỉ tiêu bán hàng và tư vấn" note={picker}>
        <div className="wp-legend">
          <span><i style={{ background: 'var(--c1)' }} />Renew</span>
          <span><i style={{ background: 'var(--c2)' }} />New</span>
          <span><i style={{ background: 'var(--ink)', width: 3 }} />Tiến độ kỳ vọng ({pc(pace)})</span>
          <span><Chip tone="ok">On track</Chip> <Chip tone="warn">Off track</Chip> <Chip tone="bad">Rất thấp</Chip></span>
        </div>
        <div className="table-wrap">
          <table className="table wp-table">
            <thead>
              <tr><th className="col-left">PT</th><th>Tiến độ doanh số</th><th>Thực đạt / Chỉ tiêu</th><th>% đạt</th><th>Trạng thái</th><th>Tỷ trọng Renew</th><th>HĐ New</th><th>Giá trị TB / HĐ</th><th>Lead MKT giao</th><th>Tỷ lệ chuyển đổi</th></tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.user_id}>
                  <td className="col-left"><b>{r.name}</b></td>
                  <td style={{ minWidth: 200 }}><Progress r={r} pace={pace} /></td>
                  <td className="num">{tr(r.total)} / {tr(r.target)}</td>
                  <td className="num"><b>{pc(r.pct)}</b></td>
                  <td><Chip tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Chip></td>
                  <td className="num">{pc(r.renew_share)}</td>
                  <td className="num">{r.new_contracts}</td>
                  <td className="num">{r.new_contracts ? tr(r.apv) : '-'}</td>
                  <td className="num">{r.leads}</td>
                  <td className="num">{pc(r.conversion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="hint-muted" style={{ padding: '8px 20px 14px' }}>Lead = khách tiềm năng Marketing giao cho PT (dữ liệu mẫu, sẽ đấu nối sau). Chuyển đổi = HĐ New / Lead.</div>
      </Panel>

      <div style={{ marginTop: 16 }}>
        <Panel title="Chất lượng tập luyện và giữ chân khách hàng">
          <div className="table-wrap">
            <table className="table wp-table">
              <thead>
                <tr><th className="col-left">PT</th><th>Buổi dạy (tháng)</th><th>Buổi dạy (TB tuần)</th><th>Tổng đặt</th><th>Hoàn thành</th><th>Hủy</th><th>Tỷ lệ hoàn thành</th><th>Tỷ lệ hủy</th><th>Khách PT</th><th>Off track &gt; 14 ngày</th><th>Tỷ lệ tái ký</th><th>Buổi / khách / tuần</th></tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.user_id}>
                    <td className="col-left"><b>{r.name}</b></td>
                    <td className="num">{r.sessions_done}</td>
                    <td className="num">{r.sessions_week}</td>
                    <td className="num">{r.booked}</td>
                    <td className="num">{r.sessions_done}</td>
                    <td className="num">{r.cancelled}</td>
                    <td className="num">{pc(r.attend_rate)}</td>
                    <td className="num"><span className={r.cancel_rate > 0.08 ? 'text-bad' : ''}>{pc(r.cancel_rate)}</span></td>
                    <td className="num">{r.clients}</td>
                    <td className="num">{r.offtrack}/{r.clients} ({pc(r.clients ? r.offtrack / r.clients : 0)})</td>
                    <td className="num">{pc(r.renew_rate)}</td>
                    <td className="num">{r.frequency.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="hint-muted" style={{ padding: '8px 20px 14px' }}>Tỷ lệ tái ký = HĐ Renew / khách PT. Ngưỡng tham khảo: hủy dưới 8%, tập 2 đến 3 buổi/khách/tuần.</div>
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
