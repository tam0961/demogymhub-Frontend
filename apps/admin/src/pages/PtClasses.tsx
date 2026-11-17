import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDateTime, fmtTime } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import { useAuth } from '../context/AuthContext'
import { RequirePermission, usePermission } from '../context/usePermission'
import { Modal } from '../components/Modal'
import { Button, Chip, DataTable, Field, Input, Kpi, KpiRow, PageHeader, Panel, Select, useToast, type ChipTone, type Column } from '../components/ui'
import type { GroupClass, GroupReg, GroupRegStatus, GroupReportRow, GroupStats, GroupTemplate, ListResp, Member } from '../types'

interface Trainer { id: string; name: string }

const pad = (n: number) => String(n).padStart(2, '0')
const localISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const mondayOf = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return localISO(d)
}
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + n)
  return localISO(d)
}
const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })

const CLASS_STATUS: Record<GroupClass['status'], { label: string; tone: ChipTone }> = {
  scheduled: { label: 'Sắp tới', tone: 'warn' },
  completed: { label: 'Đã dạy', tone: 'ok' },
  cancelled: { label: 'Đã hủy', tone: 'bad' },
}
const REG_STATUS: Record<GroupRegStatus, { label: string; tone: ChipTone }> = {
  booked: { label: 'Đã đăng ký', tone: 'warn' },
  attended: { label: 'Có mặt', tone: 'ok' },
  absent: { label: 'Vắng (mất buổi)', tone: 'bad' },
  cancelled: { label: 'Đã hủy', tone: 'bad' },
  waitlist: { label: 'Danh sách chờ', tone: 'neutral' },
}

export default function PtClasses() {
  const { branchId } = useBranch()
  const { can } = usePermission()
  const toast = useToast()
  const [week, setWeek] = useState(mondayOf(localISO(new Date())))
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [classes, setClasses] = useState<GroupClass[]>([])
  const [regs, setRegs] = useState<GroupReg[]>([])
  const [stats, setStats] = useState<GroupStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [trainerFilter, setTrainerFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<GroupClass | null>(null)
  const [templating, setTemplating] = useState(false)
  const [report, setReport] = useState<GroupReportRow[]>([])
  const [registering, setRegistering] = useState<GroupClass | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const params = { from: week, to: addDays(week, 6), branch_id: branchId ?? undefined, trainer_id: trainerFilter || undefined }
    try {
      const [c, r, s] = await Promise.all([
        api.get<{ data: GroupClass[] }>('/pt/classes', { params }),
        api.get<{ data: GroupReg[] }>('/pt/classes/registrations', { params }),
        api.get<{ data: GroupStats }>('/pt/classes/stats', { params }),
      ])
      setClasses(c.data.data)
      api.get<{ data: GroupReportRow[] }>('/pt/classes/report', { params: { months: 6, branch_id: branchId ?? undefined } }).then((r) => setReport(r.data.data)).catch(() => setReport([]))
      setRegs(r.data.data)
      setStats(s.data.data)
    } catch (e) {
      setError(apiError(e).message)
    } finally {
      setLoading(false)
    }
  }, [week, branchId, trainerFilter])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    api.get<{ data: Trainer[] }>('/pt/trainers', { params: { branch_id: branchId ?? undefined } }).then((r) => setTrainers(r.data.data)).catch(() => setTrainers([]))
  }, [branchId])

  const act = async (url: string, ok: string, body?: object) => {
    try {
      await api.post(url, body)
      toast(ok)
      load()
    } catch (e) {
      toast(apiError(e).message)
    }
  }

  const { user } = useAuth()
  const copyLink = async () => {
    const code = user?.branches.find((b) => b.id === branchId)?.code ?? user?.branches[0]?.code ?? 'q7'
    const url = `${window.location.origin}/dang-ky-lop?branch=${code.toLowerCase()}`
    try {
      await navigator.clipboard.writeText(url)
      toast(`Đã sao chép link đăng ký: ${url}`)
    } catch {
      toast(url)
    }
  }

  const generateWeek = async () => {
    try {
      const r = await api.post<{ data: { created: number } }>('/pt/classes/generate', { week_start: week, branch_id: branchId ?? undefined })
      toast(r.data.data.created ? `Đã tạo ${r.data.data.created} lớp từ khung ca` : 'Tuần này đã đủ lớp theo khung ca')
      load()
    } catch (e) {
      toast(apiError(e).message)
    }
  }

  const classCols: Column<GroupClass>[] = [
    { key: 'time', header: 'Giờ', sortValue: (c) => c.start_at, render: (c) => <><span className="cell-main">{dayLabel(c.start_at)}</span><div className="cell-sub">{fmtTime(c.start_at)} - {fmtTime(c.end_at)}</div></> },
    { key: 'title', header: 'Lớp', sortValue: (c) => c.title, render: (c) => <>{c.title}{c.muscle_group && <div className="cell-sub">{c.muscle_group}</div>}</> },
    { key: 'trainer', header: 'PT phụ trách', sortValue: (c) => c.trainer?.name ?? '', render: (c) => c.trainer?.name ?? <span className="cell-sub">Chưa phân công</span> },
    { key: 'slots', header: 'Chỗ', numeric: true, sortValue: (c) => c.registered, render: (c) => `${c.registered}/${c.capacity}` },
    { key: 'status', header: 'Trạng thái', sortValue: (c) => c.status, render: (c) => <Chip tone={CLASS_STATUS[c.status].tone}>{CLASS_STATUS[c.status].label}</Chip> },
    {
      key: 'act',
      header: '',
      render: (c) => c.status !== 'scheduled' ? null : (
        <span style={{ display: 'flex', gap: 6 }}>
          {can('pt_sessions.create') && <Button small onClick={() => setRegistering(c)} disabled={c.registered >= c.capacity}>Đăng ký khách</Button>}
          {can('pt_sessions.create') && <Button small onClick={() => setEditing(c)}>Sửa</Button>}
          {can('pt_sessions.complete') && c.trainer && <Button small variant="primary" onClick={() => act(`/pt/classes/${c.id}/complete`, 'Đã xác nhận dạy xong lớp')}>Đã dạy xong</Button>}
          {can('pt_sessions.cancel') && <Button small variant="danger" onClick={() => act(`/pt/classes/${c.id}/cancel`, 'Đã hủy lớp, đã trả buổi cho khách')}>Hủy lớp</Button>}
        </span>
      ),
    },
  ]

  const reportCols: Column<GroupReportRow>[] = [
    { key: 'month', header: 'Tháng', sortValue: (r) => r.month, render: (r) => r.month },
    { key: 'trainer', header: 'PT', sortValue: (r) => r.trainer, render: (r) => r.trainer },
    { key: 'classes', header: 'Tổng số lớp', numeric: true, sortValue: (r) => r.classes, render: (r) => r.classes },
    { key: 'attended', header: 'Tổng lượt học viên', numeric: true, sortValue: (r) => r.attended, render: (r) => r.attended },
  ]

  const regCols: Column<GroupReg>[] = [
    { key: 'name', header: 'Khách hàng', sortValue: (r) => r.name, render: (r) => <><span className="cell-main">{r.name}</span>{(r.cancel_count ?? 0) > 0 && <div className="cell-sub">Đã hủy {r.cancel_count} lần</div>}</> },
    { key: 'phone', header: 'SĐT', render: (r) => r.phone },
    { key: 'email', header: 'Email', render: (r) => r.email ?? '-' },
    { key: 'class', header: 'Lớp đăng ký', sortValue: (r) => r.class.start_at, render: (r) => <>{fmtDateTime(r.class.start_at)}<div className="cell-sub">{r.class.title}{r.class.muscle_group ? ` - ${r.class.muscle_group}` : ''}</div></> },
    { key: 'status', header: 'Trạng thái', sortValue: (r) => r.status, render: (r) => <><Chip tone={REG_STATUS[r.status].tone}>{REG_STATUS[r.status].label}</Chip>{r.status === 'booked' && r.deducted && <div className="cell-sub">Tạm trừ 1 buổi</div>}{r.status === 'waitlist' && <div className="cell-sub">Chưa trừ buổi, tự xếp lớp khi có chỗ</div>}</> },
    {
      key: 'cancel',
      header: '',
      render: (r) => (
        <>
          {r.status !== 'cancelled' && r.status !== 'waitlist' && can('pt_sessions.complete') && (
            <>
              <Button small variant={r.status === 'attended' ? 'primary' : 'secondary'} onClick={() => act(`/pt/classes/registrations/${r.id}/attendance`, 'Đã ghi nhận có mặt', { status: 'attended' })}>Có mặt</Button>{' '}
              <Button small variant={r.status === 'absent' ? 'danger' : 'secondary'} onClick={() => act(`/pt/classes/registrations/${r.id}/attendance`, 'Đã ghi nhận vắng, khách mất buổi', { status: 'absent' })}>Vắng</Button>{' '}
            </>
          )}
          {(r.status === 'booked' || r.status === 'waitlist') && can('pt_sessions.cancel') && (
            <Button small variant="danger" onClick={() => act(`/pt/classes/registrations/${r.id}/cancel`, r.status === 'waitlist' ? 'Đã bỏ khỏi danh sách chờ' : 'Đã hủy đăng ký, đã trả buổi cho khách')}>Hủy</Button>
          )}
        </>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Lịch lớp nhóm" sub="Lịch 7 ngày. Đăng ký tạm trừ 1 buổi, PT xác nhận dạy xong thì trừ chính thức, hủy thì trả lại buổi. Lớp đầy thì khách vào danh sách chờ." />
      <div className="toolbar">
        <Button small onClick={() => setWeek(addDays(week, -7))} aria-label="Tuần trước">‹</Button>
        <span className="cell-main">{dayLabel(week)} - {dayLabel(addDays(week, 6))}</span>
        <Button small onClick={() => setWeek(addDays(week, 7))} aria-label="Tuần sau">›</Button>
        <Button small onClick={() => setWeek(mondayOf(localISO(new Date())))}>Tuần này</Button>
        <Select aria-label="Lọc PT" value={trainerFilter} onChange={(e) => setTrainerFilter(e.target.value)}>
          <option value="">Tất cả PT</option>
          {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <div className="grow">
          <RequirePermission permission="pt_sessions.create">
            <Button onClick={copyLink}>Sao chép link đăng ký</Button>
            <Button onClick={() => setTemplating(true)}>Khung ca cố định</Button>
            <Button onClick={generateWeek}>Tạo lịch tuần</Button>
            <Button variant="primary" onClick={() => setCreating(true)}>Tạo lớp nhóm</Button>
          </RequirePermission>
        </div>
      </div>

      <Panel title="Các lớp trong tuần" count={classes.length} flush>
        <DataTable columns={classCols} rows={classes} rowKey={(c) => c.id} loading={loading} error={error} emptyText="Chưa có lớp nhóm trong tuần" itemLabel="lớp" />
      </Panel>

      <div style={{ height: 16 }} />
      <KpiRow>
        <Kpi value={stats?.classes.total ?? 0} label="Số lớp" />
        <Kpi value={stats?.classes.completed ?? 0} label="Lớp đã dạy" />
        <Kpi value={stats?.registrations.booked ?? 0} label="Đang chờ học" />
        <Kpi value={stats?.registrations.waitlist ?? 0} label="Danh sách chờ" />
        <Kpi value={stats?.registrations.attended ?? 0} label="Lượt có mặt" />
        <Kpi value={`${stats?.fill_rate ?? 0}%`} label="Tỷ lệ lấp đầy" />
      </KpiRow>

      <Panel title="Khách đăng ký" count={regs.length} flush>
        <DataTable columns={regCols} rows={regs} rowKey={(r) => r.id} loading={loading} error={error} emptyText="Chưa có khách đăng ký trong tuần" itemLabel="lượt" />
      </Panel>

      <div style={{ height: 16 }} />
      <Panel title="Báo cáo PT theo tháng" count={`${report.length} dòng`} flush>
        <DataTable columns={reportCols} rows={report} rowKey={(r) => `${r.month}|${r.trainer}`} emptyText="Chưa có lớp đã dạy" itemLabel="dòng" />
      </Panel>

      {editing && <EditClassModal cls={editing} trainers={trainers} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast('Đã lưu lớp'); load() }} />}
      {templating && <TemplateModal onClose={() => setTemplating(false)} />}
      {creating && <ClassModal week={week} trainers={trainers} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); toast('Đã tạo lớp'); load() }} />}
      {registering && <RegisterModal cls={registering} onClose={() => setRegistering(null)} onSaved={() => { setRegistering(null); toast('Đã đăng ký, tạm trừ 1 buổi'); load() }} />}
    </>
  )
}

function ClassModal({ week, trainers, onClose, onSaved }: { week: string; trainers: Trainer[]; onClose: () => void; onSaved: () => void }) {
  const { branchId } = useBranch()
  const { user } = useAuth()
  const [title, setTitle] = useState('PT nhóm')
  const [muscle, setMuscle] = useState('')
  const [trainerId, setTrainerId] = useState('')
  const [date, setDate] = useState(week)
  const [time, setTime] = useState('18:00')
  const [duration, setDuration] = useState('60')
  const [capacity, setCapacity] = useState('3')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const branch = branchId ?? (user?.branches.length === 1 ? user.branches[0].id : '')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post('/pt/classes', {
        title,
        muscle_group: muscle.trim() || null,
        trainer_id: trainerId || null,
        start_at: `${date}T${time}:00+07:00`,
        duration_min: Number(duration),
        capacity: Number(capacity),
        branch_id: branch || undefined,
      })
      onSaved()
    } catch (err) {
      setError(apiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Tạo lớp nhóm" onClose={onClose} footer={<><Button onClick={onClose}>Hủy</Button><Button variant="primary" type="submit" form="class-form" disabled={busy}>{busy ? 'Đang lưu...' : 'Tạo lớp'}</Button></>}>
      <form id="class-form" className="form-grid" onSubmit={submit}>
        {error && <div className="form-error full" role="alert">{error}</div>}
        <Field label="Tên lớp" htmlFor="c-title" full><Input id="c-title" required value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Nhóm cơ" htmlFor="c-muscle" full><Input id="c-muscle" placeholder="Ví dụ: Core + Cardio" value={muscle} onChange={(e) => setMuscle(e.target.value)} /></Field>
        <Field label="PT phụ trách" htmlFor="c-trainer" full>
          <Select id="c-trainer" value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
            <option value="">Chưa phân công</option>
            {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Ngày" htmlFor="c-date"><Input id="c-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Giờ bắt đầu" htmlFor="c-time"><Input id="c-time" type="time" required value={time} onChange={(e) => setTime(e.target.value)} /></Field>
        <Field label="Thời lượng (phút)" htmlFor="c-dur"><Input id="c-dur" type="number" min={15} max={240} step={15} required value={duration} onChange={(e) => setDuration(e.target.value)} /></Field>
        <Field label="Số chỗ tối đa" htmlFor="c-cap"><Input id="c-cap" type="number" min={1} max={50} required value={capacity} onChange={(e) => setCapacity(e.target.value)} /></Field>
      </form>
    </Modal>
  )
}

function RegisterModal({ cls, onClose, onSaved }: { cls: GroupClass; onClose: () => void; onSaved: () => void }) {
  const { branchId } = useBranch()
  const [q, setQ] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [memberId, setMemberId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) { setMembers([]); return }
    const t = setTimeout(() => {
      api.get<ListResp<Member>>('/members', { params: { q: q.trim(), branch_id: cls.branch_id ?? branchId ?? undefined, limit: 10 } }).then((r) => setMembers(r.data.data)).catch(() => setMembers([]))
    }, 250)
    return () => clearTimeout(t)
  }, [q, cls.branch_id, branchId])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.post(`/pt/classes/${cls.id}/registrations`, { member_id: memberId })
      onSaved()
    } catch (err) {
      setError(apiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Đăng ký khách - ${cls.title} ${fmtDateTime(cls.start_at)}`} onClose={onClose} footer={<><Button onClick={onClose}>Hủy</Button><Button variant="primary" type="submit" form="reg-form" disabled={busy || !memberId}>{busy ? 'Đang lưu...' : 'Đăng ký'}</Button></>}>
      <form id="reg-form" className="form-grid" onSubmit={submit}>
        {error && <div className="form-error full" role="alert">{error}</div>}
        <Field label="Tìm hội viên (tên, SĐT, mã)" htmlFor="r-q" full><Input id="r-q" value={q} onChange={(e) => { setQ(e.target.value); setMemberId('') }} /></Field>
        <Field label="Hội viên" htmlFor="r-member" full hint="Đăng ký sẽ tạm trừ 1 buổi gói PT nhóm. PT xác nhận dạy xong thì trừ chính thức; hủy thì trả lại buổi. Lớp đầy thì khách vào danh sách chờ.">
          <Select id="r-member" required value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="" disabled>{members.length ? 'Chọn hội viên' : 'Nhập để tìm'}</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name} - {m.phone}</option>)}
          </Select>
        </Field>
      </form>
    </Modal>
  )
}

function EditClassModal({ cls, trainers, onClose, onSaved }: { cls: GroupClass; trainers: Trainer[]; onClose: () => void; onSaved: () => void }) {
  const [muscle, setMuscle] = useState(cls.muscle_group ?? '')
  const [trainerId, setTrainerId] = useState(cls.trainer?.id ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.patch(`/pt/classes/${cls.id}`, { muscle_group: muscle.trim() || null })
      if ((cls.trainer?.id ?? '') !== trainerId) await api.post(`/pt/classes/${cls.id}/trainer`, { trainer_id: trainerId || null })
      onSaved()
    } catch (err) {
      setError(apiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={`Sửa lớp ${fmtDateTime(cls.start_at)}`} onClose={onClose} footer={<><Button onClick={onClose}>Hủy</Button><Button variant="primary" type="submit" form="edit-class-form" disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</Button></>}>
      <form id="edit-class-form" className="form-grid" onSubmit={submit}>
        {error && <div className="form-error full" role="alert">{error}</div>}
        <Field label="Nhóm cơ" htmlFor="e-muscle" full><Input id="e-muscle" value={muscle} onChange={(e) => setMuscle(e.target.value)} /></Field>
        <Field label="PT phụ trách" htmlFor="e-trainer" full>
          <Select id="e-trainer" value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
            <option value="">Chưa phân công</option>
            {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
      </form>
    </Modal>
  )
}

const WEEKDAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']

function TemplateModal({ onClose }: { onClose: () => void }) {
  const { branchId } = useBranch()
  const { user } = useAuth()
  const toast = useToast()
  const [rows, setRows] = useState<GroupTemplate[]>([])
  const [weekday, setWeekday] = useState('1')
  const [start, setStart] = useState('06:30')
  const [end, setEnd] = useState('07:45')
  const [capacity, setCapacity] = useState('3')
  const [muscle, setMuscle] = useState('')
  const [error, setError] = useState('')
  const branch = branchId ?? (user?.branches.length === 1 ? user.branches[0].id : '')

  const load = useCallback(() => {
    api.get<{ data: GroupTemplate[] }>('/pt/classes/templates', { params: { branch_id: branch || undefined } }).then((r) => setRows(r.data.data)).catch((e) => setError(apiError(e).message))
  }, [branch])
  useEffect(() => { load() }, [load])

  const add = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await api.post('/pt/classes/templates', { weekday: Number(weekday), start_time: start, end_time: end, capacity: Number(capacity), muscle_group: muscle.trim() || null, branch_id: branch || undefined })
      toast('Đã lưu khung ca')
      load()
    } catch (err) {
      setError(apiError(err).message)
    }
  }
  const remove = async (id: string) => {
    try {
      await api.delete(`/pt/classes/templates/${id}`)
      load()
    } catch (err) {
      setError(apiError(err).message)
    }
  }

  return (
    <Modal title="Khung ca cố định mỗi tuần" onClose={onClose} footer={<Button onClick={onClose}>Đóng</Button>}>
      {error && <div className="form-error" role="alert">{error}</div>}
      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
        {rows.length === 0 && <li className="cell-sub">Chưa có khung ca. Thêm khung rồi bấm "Tạo lịch tuần" để sinh lớp.</li>}
        {rows.map((t) => (
          <li key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
            <span><b>{WEEKDAYS[t.weekday - 1]}</b> {t.start_time}-{t.end_time}, {t.capacity} chỗ{t.muscle_group ? `, ${t.muscle_group}` : ''}</span>
            <Button small variant="danger" onClick={() => remove(t.id)}>Xóa</Button>
          </li>
        ))}
      </ul>
      <form className="form-grid" onSubmit={add}>
        <Field label="Thứ" htmlFor="t-day">
          <Select id="t-day" value={weekday} onChange={(e) => setWeekday(e.target.value)}>{WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</Select>
        </Field>
        <Field label="Số chỗ" htmlFor="t-cap"><Input id="t-cap" type="number" min={1} max={50} required value={capacity} onChange={(e) => setCapacity(e.target.value)} /></Field>
        <Field label="Bắt đầu" htmlFor="t-start"><Input id="t-start" type="time" required value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Kết thúc" htmlFor="t-end"><Input id="t-end" type="time" required value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        <Field label="Nhóm cơ mặc định" htmlFor="t-muscle" full><Input id="t-muscle" value={muscle} onChange={(e) => setMuscle(e.target.value)} /></Field>
        <div className="full"><Button type="submit" variant="primary">Thêm khung ca</Button></div>
      </form>
    </Modal>
  )
}
