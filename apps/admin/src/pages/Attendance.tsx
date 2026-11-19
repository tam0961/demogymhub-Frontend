import { Fragment, useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtTime } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { usePermission } from '../context/usePermission'
import { Modal } from '../components/Modal'
import { Button, Chip, Field, Input, Kpi, KpiRow, PageHeader, Panel, Select, useToast } from '../components/ui'
import { copyText } from './Expiring'

interface Day { date: string; first: string; last: string; count: number; hours: number }
interface StaffRow { user_id: string | null; name: string; employee_no: string; linked: boolean; days: Day[]; total_days: number; total_hours: number }
interface Device { id: string; name: string; branch_id: string; branch_name?: string; device_key: string; last_seen_at: string | null }
interface Punch { id: string; punched_at: string; source: string }

const monthNow = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const fmtDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const pushUrl = (key: string) => `${window.location.origin}/api/public/attendance/hikvision/${key}`

export default function Attendance() {
  const { can } = usePermission()
  const { branchId } = useBranch()
  const toast = useToast()
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
        sub="Giờ vào là lần quét đầu tiên trong ngày, giờ ra là lần quét cuối cùng."
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
      {manage && <DevicesPanel onToast={toast} />}
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

function DevicesPanel({ onToast }: { onToast: (m: string) => void }) {
  const { user } = useAuth()
  const [devices, setDevices] = useState<Device[]>([])
  const [name, setName] = useState('')
  const [branch, setBranch] = useState(user?.branches.length === 1 ? user.branches[0].id : '')
  const [err, setErr] = useState('')
  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: Device[] }>('/attendance/devices')
      setDevices(data.data)
    } catch (e) {
      setErr(apiError(e).message)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const add = async (e: FormEvent) => {
    e.preventDefault()
    setErr('')
    try {
      await api.post('/attendance/devices', { name: name.trim(), branch_id: branch || undefined })
      setName('')
      await load()
    } catch (er) {
      setErr(apiError(er).message)
    }
  }
  const remove = async (id: string) => {
    try {
      await api.delete(`/attendance/devices/${id}`)
      await load()
    } catch (er) {
      onToast(apiError(er).message)
    }
  }
  const copy = async (text: string) => onToast((await copyText(text)) ? 'Đã sao chép' : 'Không sao chép được')

  return (
    <>
      <div style={{ height: 16 }} />
      <Panel title="Máy chấm công Hikvision">
        <p className="cell-sub">
          Tạo một thiết bị cho mỗi máy, rồi vào trang cài đặt của máy: Cấu hình, Mạng, Cài đặt nâng cao, HTTP Listening (hoặc Event Receiver). Dán địa chỉ bên dưới vào mục URL, bật gửi sự kiện kiểm soát ra vào. Sau đó gán mã nhân viên trên máy cho tài khoản ở Nhân sự, Nhân viên.
        </p>
        {err && <div className="form-error" role="alert">{err}</div>}
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Thiết bị</th><th>Chi nhánh</th><th>Địa chỉ nhận dữ liệu</th><th>Lần cuối nhận</th><th /></tr></thead>
            <tbody>
              {devices.length === 0 && <tr><td colSpan={5} className="cell-sub">Chưa có thiết bị.</td></tr>}
              {devices.map((d) => (
                <tr key={d.id}>
                  <td><span className="cell-main">{d.name}</span></td>
                  <td>{d.branch_name}</td>
                  <td><code style={{ wordBreak: 'break-all' }}>{pushUrl(d.device_key)}</code></td>
                  <td>{d.last_seen_at ? new Date(d.last_seen_at).toLocaleString('vi-VN') : <Chip tone="warn">Chưa nhận dữ liệu</Chip>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Button small onClick={() => copy(pushUrl(d.device_key))}>Sao chép</Button>{' '}
                    <Button small variant="danger" onClick={() => remove(d.id)}>Xóa</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form onSubmit={add} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 12, flexWrap: 'wrap' }}>
          <Field label="Tên thiết bị" htmlFor="dv-name"><Input id="dv-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Cổng chính" /></Field>
          {(user?.branches.length ?? 0) > 1 && (
            <Field label="Chi nhánh" htmlFor="dv-branch">
              <Select id="dv-branch" required value={branch} onChange={(e) => setBranch(e.target.value)}>
                <option value="">Chọn chi nhánh</option>
                {user?.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </Field>
          )}
          <Button type="submit" variant="primary">Thêm thiết bị</Button>
        </form>
      </Panel>
    </>
  )
}
