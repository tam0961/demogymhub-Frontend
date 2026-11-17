import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDateTime, fmtTime } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import { useAuth } from '../context/AuthContext'
import { RequirePermission, usePermission } from '../context/usePermission'
import { Modal } from '../components/Modal'
import { Button, Chip, DataTable, Field, Input, Kpi, KpiRow, PageHeader, Select, useToast, type ChipTone, type Column } from '../components/ui'
import type { GroupClass, GroupReg, GroupRegStatus, GroupStats, GroupTemplate, ListResp, Member } from '../types'

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

interface PtReportRow { pt: string; taught: number; booked: number; attended: number; people: number; upcoming: number }

function buildReport(classes: GroupClass[], regs: GroupReg[]): PtReportRow[] {
  const now = Date.now()
  const live = (r: GroupReg) => r.status === 'booked' || r.status === 'attended' || r.status === 'absent'
  const by = new Map<string, { row: PtReportRow; phones: Set<string> }>()
  const get = (name: string) => {
    if (!by.has(name)) by.set(name, { row: { pt: name, taught: 0, booked: 0, attended: 0, people: 0, upcoming: 0 }, phones: new Set() })
    return by.get(name)!
  }
  for (const c of classes) {
    if (c.status === 'cancelled') continue
    const mine = regs.filter((r) => r.class.id === c.id && live(r))
    if (!mine.length) continue
    const g = get(c.trainer?.name ?? 'Chưa phân công')
    if (new Date(c.end_at).getTime() <= now) g.row.taught += 1
    else g.row.upcoming += 1
    g.row.booked += mine.length
    g.row.attended += mine.filter((r) => r.status === 'attended').length
    mine.forEach((r) => g.phones.add(r.phone))
  }
  return [...by.values()].map((g) => ({ ...g.row, people: g.phones.size })).sort((a, b) => a.pt.localeCompare(b.pt))
}

export default function PtClasses() {
  const { branchId } = useBranch()
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
  const [reportScope, setReportScope] = useState<'week' | 'month'>('week')
  const [monthData, setMonthData] = useState<{ classes: GroupClass[]; regs: GroupReg[] }>({ classes: [], regs: [] })
  const [registering, setRegistering] = useState<GroupClass | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [showEmpty, setShowEmpty] = useState(false)

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
    if (reportScope !== 'month') return
    const first = `${week.slice(0, 7)}-01`
    const last = localISO(new Date(+week.slice(0, 4), +week.slice(5, 7), 0))
    const params = { from: first, to: last, branch_id: branchId ?? undefined, trainer_id: trainerFilter || undefined }
    Promise.all([
      api.get<{ data: GroupClass[] }>('/pt/classes', { params }),
      api.get<{ data: GroupReg[] }>('/pt/classes/registrations', { params }),
    ]).then(([c, r]) => setMonthData({ classes: c.data.data, regs: r.data.data })).catch(() => setMonthData({ classes: [], regs: [] }))
  }, [reportScope, week, branchId, trainerFilter])
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

  const today = localISO(new Date())
  const shown = classes.filter((c) => c.status !== 'cancelled' && (showEmpty || c.registered > 0))
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i)).filter((d, i) => i < 6 || shown.some((c) => localISO(new Date(c.start_at)) === d))
  const slots = [...new Set(shown.map((c) => fmtTime(c.start_at)))].sort()
  const detail = classes.find((c) => c.id === detailId) ?? null
  const bookedSlots = classes.filter((c) => c.status !== 'cancelled' && c.registered > 0).length
  const totalSlots = classes.filter((c) => c.status !== 'cancelled').length
  const seatsTaken = classes.filter((c) => c.status !== 'cancelled').reduce((n, c) => n + c.registered, 0)
  const seatsAll = classes.filter((c) => c.status !== 'cancelled').reduce((n, c) => n + c.capacity, 0)
  const fillTone = (c: GroupClass) => (c.registered >= c.capacity ? 'bad' : c.capacity > 1 && c.registered >= c.capacity - 1 ? 'warn' : 'ok')

  const repSrc = reportScope === 'week' ? { classes, regs } : monthData
  const reportRows = buildReport(repSrc.classes, repSrc.regs)
  const reportCols: Column<PtReportRow>[] = [
    { key: 'pt', header: 'PT', sortValue: (r) => r.pt, render: (r) => <span className="cell-main">{r.pt}</span> },
    { key: 'taught', header: 'Ca đã dạy', numeric: true, sortValue: (r) => r.taught, render: (r) => r.taught },
    { key: 'booked', header: 'Lượt học viên đã đặt', numeric: true, sortValue: (r) => r.booked, render: (r) => r.booked },
    { key: 'attended', header: 'Lượt "Đã học"', numeric: true, sortValue: (r) => r.attended, render: (r) => r.attended },
    { key: 'people', header: 'Học viên (người)', numeric: true, sortValue: (r) => r.people, render: (r) => r.people },
    { key: 'upcoming', header: 'Ca sắp dạy', numeric: true, sortValue: (r) => r.upcoming, render: (r) => r.upcoming },
  ]

  return (
    <>
      <div className="gcal-top">
        <PageHeader title="Lịch lớp nhóm" sub="Lịch 7 ngày. Đăng ký tạm trừ 1 buổi, PT xác nhận dạy xong thì trừ chính thức, hủy thì trả lại buổi. Lớp đầy thì khách vào danh sách chờ." />
        <div className="toolbar gcal-nav">
          <Button small onClick={() => setWeek(addDays(week, -7))} aria-label="Tuần trước">‹</Button>
          <span className="cell-main">{dayLabel(week)} - {dayLabel(addDays(week, 6))}{week === mondayOf(today) ? ' (tuần này)' : ''}</span>
          <Button small onClick={() => setWeek(addDays(week, 7))} aria-label="Tuần sau">›</Button>
          <Button small onClick={() => setWeek(mondayOf(localISO(new Date())))}>Tuần này</Button>
          <Select aria-label="Lọc PT" value={trainerFilter} onChange={(e) => setTrainerFilter(e.target.value)}>
            <option value="">Tất cả PT</option>
            {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <Button small variant={showEmpty ? 'primary' : 'secondary'} onClick={() => setShowEmpty(!showEmpty)}>Hiện lớp trống</Button>
        </div>
      </div>
      <RequirePermission permission="pt_sessions.create">
        <div className="toolbar">
          <Button onClick={copyLink}>Sao chép link đăng ký</Button>
          <Button onClick={() => setTemplating(true)}>Khung ca cố định</Button>
          <Button onClick={generateWeek}>Tạo lịch tuần</Button>
          <Button variant="primary" onClick={() => setCreating(true)}>Tạo lớp nhóm</Button>
        </div>
      </RequirePermission>

      <div className="card gcal">
        {error ? <div className="empty">{error}</div> : (
          <div className="gcal-scroll">
            <div className="gcal-grid" style={{ gridTemplateColumns: `72px repeat(${days.length}, minmax(0, 1fr))` }}>
              <div className="gcal-corner" />
              {days.map((d) => (
                <div key={d} className={`gcal-head${d === today ? ' today' : ''}`}>
                  <div className="gcal-dow">{new Date(`${d}T12:00:00`).getDay() === 0 ? 'CN' : `Thứ ${new Date(`${d}T12:00:00`).getDay() + 1}`}</div>
                  <div className="gcal-date">{pad(+d.slice(8, 10))}/{pad(+d.slice(5, 7))}</div>
                </div>
              ))}
              {slots.map((slot) => (
                <GridRow key={slot} slot={slot} days={days} today={today} items={shown.filter((c) => fmtTime(c.start_at) === slot)} regs={regs} fillTone={fillTone} onOpen={setDetailId} />
              ))}
              {!loading && slots.length === 0 && <div className="empty" style={{ gridColumn: '1 / -1' }}>Chưa có lớp nào có người đăng ký trong tuần</div>}
            </div>
          </div>
        )}
      </div>
      <p className="gcal-note">Chỉ hiện các lớp đã có người đăng ký ("Hiện lớp trống" để xem cả lớp chưa ai đặt). Xanh là còn chỗ, vàng gần đầy, đỏ đã đầy. Bấm vào một ca để xem danh sách học viên, điểm danh, hủy đăng ký và các thao tác của lớp.</p>

      <KpiRow>
        <Kpi value={`${bookedSlots} / ${totalSlots}`} label="Ca có người đăng ký" />
        <Kpi value={`${seatsTaken} / ${seatsAll}`} label="Chỗ đã đặt" note={`Mức lấp đầy ${seatsAll ? Math.round((seatsTaken / seatsAll) * 100) : 0}%`} />
        <Kpi value={stats?.registrations.attended ?? 0} label="Đã học" note='Lượt được đánh dấu "Đã học" trong tuần' />
        <Kpi value={stats?.registrations.cancelled ?? 0} label="Lượt hủy" note="Trong tuần đang xem" />
      </KpiRow>

      <div style={{ height: 16 }} />
      <section className="panel">
        <div className="panel-head">
          <h2>Báo cáo ca dạy theo PT, {reportScope === 'week' ? `Tuần ${dayLabel(week).split(' ').pop()} - ${dayLabel(addDays(week, 6)).split(' ').pop()}` : `Tháng ${week.slice(5, 7)}/${week.slice(0, 4)}`}</h2>
          <div className="tabs" role="tablist">
            <button type="button" role="tab" className="tab" aria-selected={reportScope === 'week'} onClick={() => setReportScope('week')}>Tuần đang xem</button>
            <button type="button" role="tab" className="tab" aria-selected={reportScope === 'month'} onClick={() => setReportScope('month')}>Cả tháng</button>
          </div>
        </div>
        <DataTable columns={reportCols} rows={reportRows} rowKey={(r) => r.pt} emptyText="Chưa có ca dạy" itemLabel="PT" />
        <p className="gcal-note" style={{ padding: '0 16px 12px' }}>Ca đã dạy là ca đã kết thúc và có ít nhất một học viên đăng ký, không tính lượt hủy. Học viên (người) đếm theo số điện thoại, không đếm trùng.</p>
      </section>

      {detail && (
        <ClassDetailModal
          cls={detail}
          regs={regs.filter((r) => r.class.id === detail.id)}
          act={act}
          onClose={() => setDetailId(null)}
          onRegister={() => setRegistering(detail)}
          onEdit={() => { setEditing(detail); setDetailId(null) }}
        />
      )}
      {editing && <EditClassModal cls={editing} trainers={trainers} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast('Đã lưu lớp'); load() }} />}
      {templating && <TemplateModal onClose={() => setTemplating(false)} />}
      {creating && <ClassModal week={week} trainers={trainers} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); toast('Đã tạo lớp'); load() }} />}
      {registering && <RegisterModal cls={registering} onClose={() => setRegistering(null)} onSaved={() => { setRegistering(null); toast('Đã đăng ký, tạm trừ 1 buổi'); load() }} />}
    </>
  )
}

function GridRow({ slot, days, today, items, regs, fillTone, onOpen }: { slot: string; days: string[]; today: string; items: GroupClass[]; regs: GroupReg[]; fillTone: (c: GroupClass) => string; onOpen: (id: string) => void }) {
  return (
    <>
      <div className="gcal-time">{slot}</div>
      {days.map((d) => {
        const cell = items.filter((c) => localISO(new Date(c.start_at)) === d)
        return (
          <div key={d} className={`gcal-cell${d === today ? ' today' : ''}`}>
            {cell.length === 0 && <span className="gcal-empty">-</span>}
            {cell.map((c) => {
              const mine = regs.filter((r) => r.class.id === c.id && r.status !== 'cancelled' && r.status !== 'waitlist')
              const tone = fillTone(c)
              return (
                <button key={c.id} type="button" className={`gcal-card ${tone}${c.status === 'completed' ? ' done' : ''}`} onClick={() => onOpen(c.id)}>
                  <span className="gcal-title">{c.title}{c.muscle_group ? ` + ${c.muscle_group}` : ''}</span>
                  <span className="gcal-pt">{c.trainer?.name ?? 'Chưa phân công'}</span>
                  <span className="gcal-slots">{c.registered} / {c.capacity} chỗ</span>
                  <span className="gcal-bar"><span style={{ width: `${Math.min(100, (c.registered / Math.max(1, c.capacity)) * 100)}%` }} /></span>
                  <span className="gcal-chips">{mine.map((r) => <span key={r.id} className={`gcal-chip${r.status === 'absent' ? ' bad' : ''}`}>{r.name}</span>)}</span>
                </button>
              )
            })}
          </div>
        )
      })}
    </>
  )
}

function ClassDetailModal({ cls, regs, act, onClose, onRegister, onEdit }: { cls: GroupClass; regs: GroupReg[]; act: (url: string, ok: string, body?: object) => void; onClose: () => void; onRegister: () => void; onEdit: () => void }) {
  const { can } = usePermission()
  const cols: Column<GroupReg>[] = [
    { key: 'name', header: 'Khách hàng', sortValue: (r) => r.name, render: (r) => <><span className="cell-main">{r.name}</span><div className="cell-sub">{r.phone}</div></> },
    { key: 'status', header: 'Trạng thái', sortValue: (r) => r.status, render: (r) => <Chip tone={REG_STATUS[r.status].tone}>{REG_STATUS[r.status].label}</Chip> },
    { key: 'left', header: 'Còn lại / hủy', numeric: true, sortValue: (r) => r.sessions_left ?? 0, render: (r) => `${r.sessions_left ?? '-'} / ${r.cancel_count ?? 0}` },
    {
      key: 'act',
      header: '',
      render: (r) => (
        <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          {r.status !== 'cancelled' && r.status !== 'waitlist' && can('pt_sessions.complete') && (
            <>
              <Button small variant={r.status === 'attended' ? 'primary' : 'secondary'} onClick={() => act(`/pt/classes/registrations/${r.id}/attendance`, 'Đã ghi nhận có mặt', { status: 'attended' })}>Có mặt</Button>
              <Button small variant={r.status === 'absent' ? 'danger' : 'secondary'} onClick={() => act(`/pt/classes/registrations/${r.id}/attendance`, 'Đã ghi nhận vắng, khách mất buổi', { status: 'absent' })}>Vắng</Button>
            </>
          )}
          {(r.status === 'booked' || r.status === 'waitlist') && can('pt_sessions.cancel') && (
            <Button small variant="danger" onClick={() => act(`/pt/classes/registrations/${r.id}/cancel`, r.status === 'waitlist' ? 'Đã bỏ khỏi danh sách chờ' : 'Đã hủy đăng ký, đã trả buổi cho khách')}>Hủy</Button>
          )}
        </span>
      ),
    },
  ]
  const open = cls.status === 'scheduled'
  return (
    <Modal
      title={`${cls.title}${cls.muscle_group ? ` - ${cls.muscle_group}` : ''}`}
      size="large"
      onClose={onClose}
      footer={open ? (
        <>
          {can('pt_sessions.cancel') && <Button variant="danger" onClick={() => { act(`/pt/classes/${cls.id}/cancel`, 'Đã hủy lớp, đã trả buổi cho khách'); onClose() }}>Hủy lớp</Button>}
          {can('pt_sessions.create') && <Button onClick={onEdit}>Sửa</Button>}
          {can('pt_sessions.create') && <Button onClick={onRegister} disabled={cls.registered >= cls.capacity}>Đăng ký khách</Button>}
          {can('pt_sessions.complete') && cls.trainer && <Button variant="primary" onClick={() => act(`/pt/classes/${cls.id}/complete`, 'Đã xác nhận dạy xong lớp')}>Đã dạy xong</Button>}
        </>
      ) : undefined}
    >
      <p className="cell-sub" style={{ marginBottom: 12 }}>
        {fmtDateTime(cls.start_at)} - {fmtTime(cls.end_at)} · PT: {cls.trainer?.name ?? 'Chưa phân công'} · {cls.registered}/{cls.capacity} chỗ · <Chip tone={CLASS_STATUS[cls.status].tone}>{CLASS_STATUS[cls.status].label}</Chip>
      </p>
      <DataTable columns={cols} rows={regs} rowKey={(r) => r.id} emptyText="Chưa có khách đăng ký" itemLabel="lượt" />
    </Modal>
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
        <Field label="Hội viên" htmlFor="r-member" full hint="Đăng ký sẽ tạm trừ 1 buổi gói PT nhóm. PT xác nhận dạy xong thì trừ chính thức; hủy thì trả lại buổi.">
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
