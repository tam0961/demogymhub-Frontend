import { Fragment, useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtTime } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import { usePermission } from '../context/usePermission'
import { Modal } from '../components/Modal'
import { Button, Chip, Field, Input, Kpi, KpiRow, PageHeader, useToast } from '../components/ui'

interface Day { date: string; first: string; last: string; count: number; hours: number }
interface StaffRow { user_id: string | null; name: string; employee_no: string; linked: boolean; days: Day[]; total_days: number; total_hours: number }
interface Punch { id: string; punched_at: string; source: string }

const monthNow = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const fmtDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export default function Attendance() {
  const { can } = usePermission()
  const { branchId } = useBranch()
  const [month, setMonth] = useState(monthNow())
  const [rows, setRows] = useState<StaffRow[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<{ user: StaffRow; date: string } | null>(null)
  const manage = can('attendance.manage')

  const load = useCallback(async () => {
    setError('')
    try {
      const { data } = await api.get<{ data: StaffRow[] }>('/attendance/summary', { params: { month, branch_id: branchId ?? undefined } })
      setRows(data.data)
    } catch (e) {
      setError(apiError(e).message)
    }
  }, [month, branchId])
  useEffect(() => { load() }, [load])

  const totalHours = rows.reduce((a, r) => a + r.total_hours, 0)
  const unlinked = rows.filter((r) => !r.linked).length

  return (
    <>
      <PageHeader
        title="Chấm công"
        sub="Giờ vào là lần quét đầu tiên trong ngày, giờ ra là lần quét cuối cùng. Thêm máy chấm công ở Thiết lập, Thiết bị."
        action={<Input type="month" aria-label="Tháng" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />}
      />
      <KpiRow>
        <Kpi value={rows.filter((r) => r.linked).length} label="Nhân viên có chấm công" />
        <Kpi value={Math.round(totalHours * 10) / 10} label="Tổng giờ trong tháng" />
        <Kpi value={unlinked} label="Mã chưa gán nhân viên" note={unlinked ? 'Gán ở Nhân sự, Nhân viên' : undefined} />
      </KpiRow>
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Nhân viên</th><th>Mã chấm công</th><th className="num">Ngày công</th><th className="num">Tổng giờ</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={4} className="cell-sub">Chưa có dữ liệu chấm công trong tháng này.</td></tr>}
              {rows.map((r) => {
                const k = r.user_id ?? r.employee_no
                return (
                  <Fragment key={k}>
                    <tr className="row-click" onClick={() => setOpen(open === k ? null : k)}>
                      <td><span className="cell-main">{r.name}</span></td>
                      <td>{r.employee_no}</td>
                      <td className="num">{r.total_days}</td>
                      <td className="num">{r.total_hours}</td>
                    </tr>
                    {open === k && (
                      <tr>
                        <td colSpan={4}>
                          <div className="table-wrap">
                            <table className="table">
                              <thead><tr><th>Ngày</th><th>Vào</th><th>Ra</th><th className="num">Giờ</th><th className="num">Lượt quét</th><th /></tr></thead>
                              <tbody>
                                {r.days.map((d) => (
                                  <tr key={d.date}>
                                    <td>{fmtDay(d.date)}</td>
                                    <td>{fmtTime(d.first)}</td>
                                    <td>{d.count > 1 ? fmtTime(d.last) : <Chip tone="warn">Thiếu giờ ra</Chip>}</td>
                                    <td className="num">{d.hours}</td>
                                    <td className="num">{d.count}</td>
                                    <td>{r.linked && <Button small onClick={() => setDetail({ user: r, date: d.date })}>Chi tiết</Button>}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {detail && <DayModal user={detail.user} date={detail.date} manage={manage} onClose={() => setDetail(null)} onChanged={load} />}
    </>
  )
}

function DayModal({ user, date, manage, onClose, onChanged }: { user: StaffRow; date: string; manage: boolean; onClose: () => void; onChanged: () => void }) {
  const toast = useToast()
  const [punches, setPunches] = useState<Punch[]>([])
  const [time, setTime] = useState('')
  const load = useCallback(async () => {
    const { data } = await api.get<{ data: Punch[] }>('/attendance/punches', { params: { user_id: user.user_id, date } })
    setPunches(data.data)
  }, [user.user_id, date])
  useEffect(() => { load().catch(() => setPunches([])) }, [load])

  const add = async (e: FormEvent) => {
    e.preventDefault()
    try {
      await api.post('/attendance/punches', { user_id: user.user_id, punched_at: new Date(`${date}T${time}:00+07:00`).toISOString() })
      setTime('')
      await load()
      onChanged()
    } catch (err) {
      toast(apiError(err).message)
    }
  }
  const remove = async (id: string) => {
    try {
      await api.delete(`/attendance/punches/${id}`)
      await load()
      onChanged()
    } catch (err) {
      toast(apiError(err).message)
    }
  }
  return (
    <Modal title={`${user.name} - ${fmtDay(date)}`} onClose={onClose} footer={<Button onClick={onClose}>Đóng</Button>}>
      <ul className="plain-list">
        {punches.map((p) => (
          <li key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
            <span>{fmtTime(p.punched_at)} <span className="cell-sub">{p.source === 'manual' ? '(nhập tay)' : '(máy chấm công)'}</span></span>
            {manage && <Button small variant="danger" onClick={() => remove(p.id)}>Xóa</Button>}
          </li>
        ))}
      </ul>
      {manage && (
        <form onSubmit={add} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 12 }}>
          <Field label="Thêm lượt quét thủ công" htmlFor="p-time"><Input id="p-time" type="time" required value={time} onChange={(e) => setTime(e.target.value)} /></Field>
          <Button type="submit" variant="primary">Thêm</Button>
        </form>
      )}
    </Modal>
  )
}
