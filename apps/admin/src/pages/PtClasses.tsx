import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { CONTRACT_STATUS, fmtDate, fmtDateTime, fmtTime } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import { useAuth } from '../context/AuthContext'
import { usePermission } from '../context/usePermission'
import { Modal } from '../components/Modal'
import { ConfirmDialog } from '../components/Dialogs'
import { MemberProfile } from './Members'
import { Button, Chip, DataTable, Field, Input, Kpi, KpiRow, Panel, Select, useToast, type ChipTone, type Column } from '../components/ui'
import type { GroupClass, Contract, GroupReg, GroupRegStatus, GroupStats, GroupTemplate, Member } from '../types'

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

const REG_STATUS: Record<GroupRegStatus, { label: string; tone: ChipTone }> = {
  booked: { label: 'Đã đăng ký', tone: 'warn' },
  attended: { label: 'Có mặt', tone: 'ok' },
  absent: { label: 'Vắng (mất buổi)', tone: 'bad' },
  cancelled: { label: 'Đã hủy', tone: 'bad' },
  waitlist: { label: 'Danh sách chờ', tone: 'neutral' },
}

const WEEKDAY = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']
const weekdayOf = (iso: string) => WEEKDAY[new Date(iso).getDay()]
const dmyLocal = (iso: string) => { const d = new Date(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` }
const regTone = (r: GroupReg): { label: string; tone: ChipTone } => {
  if (r.status === 'attended') return { label: 'Đã học', tone: 'ok' }
  if (r.status === 'absent') return { label: 'Vắng', tone: 'bad' }
  if (r.status === 'cancelled') return { label: 'Đã hủy', tone: 'bad' }
  if (r.status === 'waitlist') return { label: 'Danh sách chờ', tone: 'neutral' }
  return { label: 'Đã đặt lịch', tone: 'warn' }
}

const cancelLockAt = (startIso: string) => {
  const day = new Date(startIso).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
  return new Date(`${day}T00:00:00+07:00`).getTime() - 86400000 + 21 * 3600000
}
const LOCK_OVERRIDE_ROLES = ['super_admin', 'owner', 'branch_manager']

const hm = (iso: string | undefined, fallback = '') => {
  if (!iso) return fallback
  const d = new Date(iso)
  const m = d.getMinutes()
  return `${d.getHours()}h${m ? String(m).padStart(2, '0') : ''}`
}

const classTitle = (t: string) => t.replace(/^PT nhóm\s*[-:]?\s*/i, '').trim() || 'Lớp'
const ptName = (t: { name: string } | null) => `PT ${t?.name.trim().split(/\s+/).pop() ?? 'Thịnh'}`

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
  const [memberPopupId, setMemberPopupId] = useState<string | null>(null)
  const [groupMembers, setGroupMembers] = useState<Contract[]>([])
  const [cancelCounts, setCancelCounts] = useState<Record<string, number>>({})
  const [stats, setStats] = useState<GroupStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [trainerFilter, setTrainerFilter] = useState('')
  const [templating, setTemplating] = useState(false)
  const [reportScope, setReportScope] = useState<'week' | 'month'>('week')
  const [monthData, setMonthData] = useState<{ classes: GroupClass[]; regs: GroupReg[] }>({ classes: [], regs: [] })
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
      api.get<{ data: Record<string, number> }>('/pt/classes/cancel-counts', { params: { branch_id: branchId ?? undefined } }).then((x) => setCancelCounts(x.data.data)).catch(() => setCancelCounts({}))
      api.get<{ data: Contract[] }>('/contracts', { params: { category: 'pt_group', limit: 100, branch_id: branchId ?? undefined } }).then((g) => setGroupMembers(g.data.data.filter((c) => ['active', 'expired', 'frozen'].includes(c.status)))).catch(() => setGroupMembers([]))
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

  const memberCols: Column<Contract>[] = [
    { key: 'name', header: 'Hội viên', sortValue: (c) => c.member.name, render: (c) => <><button type="button" className="cell-main member-link" onClick={() => setMemberPopupId(c.member_id)}>{c.member.name}</button><div className="cell-sub">{c.member.code}</div></> },
    { key: 'phone', header: 'SĐT', render: (c) => c.member.phone },
    { key: 'email', header: 'Email', render: (c) => c.member.email ?? '-' },
    { key: 'pkg', header: 'Gói PT nhóm', sortValue: (c) => c.package.name, render: (c) => c.package.name },
    { key: 'left', header: 'Còn lại', numeric: true, sortValue: (c) => c.sessions_left ?? 0, render: (c) => c.sessions_total != null ? `${c.sessions_left ?? 0} / ${c.sessions_total} buổi` : '-' },
    { key: 'end', header: 'Hết hạn', numeric: true, sortValue: (c) => c.usage_deadline ?? c.end_date ?? '', render: (c) => fmtDate(c.usage_deadline ?? c.end_date) },
    { key: 'cancels', header: 'Số lần hủy', numeric: true, sortValue: (c) => cancelCounts[c.member_id] ?? 0, render: (c) => ((cancelCounts[c.member_id] ?? 0) > 0 ? <span className="text-bad">{cancelCounts[c.member_id]}</span> : <span className="hint-muted">0</span>) },
    { key: 'status', header: 'Trạng thái', sortValue: (c) => c.status, render: (c) => <Chip tone={CONTRACT_STATUS[c.status].tone}>{CONTRACT_STATUS[c.status].label}</Chip> },
  ]
  const classRows = classes.filter((c) => c.status !== 'cancelled' && c.registered > 0).sort((a, b) => b.start_at.localeCompare(a.start_at))
  const classCols: Column<GroupClass>[] = [
    { key: 'when', header: 'Lớp', sortValue: (c) => c.start_at, render: (c) => <><div className="reg-when">{weekdayOf(c.start_at)}, {dmyLocal(c.start_at)} {fmtTime(c.start_at)} - {fmtTime(c.end_at)}</div><div className="cell-sub">{classTitle(c.title)}{c.muscle_group ? ` + ${c.muscle_group}` : ''}</div></> },
    { key: 'pt', header: 'PT', sortValue: (c) => c.trainer?.name ?? '', render: (c) => (c.trainer ? ptName(c.trainer) : '-') },
    { key: 'reg', header: 'Đã đăng ký', numeric: true, sortValue: (c) => c.registered, render: (c) => <Chip tone={fillTone(c)}>{c.registered} / {c.capacity}</Chip> },
    { key: 'status', header: 'Trạng thái', sortValue: (c) => c.status, render: (c) => (c.status === 'completed' ? <Chip tone="ok">Đã dạy</Chip> : <Chip tone="warn">Sắp diễn ra</Chip>) },
    { key: 'open', header: '', render: (c) => <Button small onClick={() => setDetailId(c.id)}>Xem</Button> },
  ]
  const repSrc = reportScope === 'week' ? { classes, regs } : monthData
  const reportRows = buildReport(repSrc.classes, repSrc.regs)
  const reportCols: Column<PtReportRow>[] = [
    { key: 'pt', header: 'PT', sortValue: (r) => r.pt, render: (r) => <span className="cell-main">{r.pt}</span> },
    { key: 'taught', header: 'Lớp đã dạy', numeric: true, sortValue: (r) => r.taught, render: (r) => r.taught },
    { key: 'booked', header: 'Lượt học viên đã đặt', numeric: true, sortValue: (r) => r.booked, render: (r) => r.booked },
    { key: 'attended', header: 'Số lượng học viên', numeric: true, sortValue: (r) => r.attended, render: (r) => r.attended },
  ]

  return (
    <>
      <div className="gcal-top">
        <div className="page-head gcal-title-row">
          <h1>Lịch lớp nhóm</h1>
          <a className="gcal-link" href="https://booking.thgym.com" target="_blank" rel="noopener noreferrer">booking.thgym.com</a>
        </div>
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
      <div className="card gcal">
        {error ? <div className="empty">{error}</div> : (
          <div className="gcal-scroll">
            <div className="gcal-grid" style={{ gridTemplateColumns: `88px repeat(${days.length}, minmax(0, 1fr))` }}>
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

      <div className="even-cols">
        <RegistrationsPanel regs={regs} act={act} />
      </div>
      <div style={{ height: 16 }} />
      <div className="even-cols">
        <Panel title="Danh sách lớp đã đăng ký" count={`${classRows.length} lớp`} flush>
          <div className="cls-table"><DataTable columns={classCols} rows={classRows} rowKey={(c) => c.id} pageSize={10} pageSizes={[10, 25, 50]} emptyText="Chưa có lớp nào có người đăng ký trong tuần" itemLabel="lớp" /></div>
        </Panel>
      </div>
      <div style={{ height: 16 }} />
      <div className="even-cols">
      <Panel title="Hội viên PT nhóm" count={`${groupMembers.length} hội viên`} flush>
        <div className="grp-members">
        <DataTable columns={memberCols} rows={groupMembers} rowKey={(c) => c.id} loading={loading} error={error} pageSize={10} pageSizes={[10, 25, 50]} emptyText="Chưa có hội viên PT nhóm" itemLabel="hội viên" />
        </div>
      </Panel>
      </div>

      <div style={{ height: 16 }} />

      <div style={{ height: 16 }} />
      <section className="panel">
        <div className="panel-head">
          <h2>Báo cáo ca dạy theo PT, {reportScope === 'week' ? `Tuần ${dayLabel(week).split(' ').pop()} - ${dayLabel(addDays(week, 6)).split(' ').pop()}` : `Tháng ${week.slice(5, 7)}/${week.slice(0, 4)}`}</h2>
          <div className="tabs" role="tablist">
            <button type="button" role="tab" className="tab" aria-selected={reportScope === 'week'} onClick={() => setReportScope('week')}>Tuần đang xem</button>
            <button type="button" role="tab" className="tab" aria-selected={reportScope === 'month'} onClick={() => setReportScope('month')}>Cả tháng</button>
          </div>
        </div>
        <DataTable columns={reportCols} rows={reportRows} rowKey={(r) => r.pt} emptyText="Chưa có ca dạy" itemLabel="PT" hidePager />
        <p className="gcal-note" style={{ padding: '0 16px 12px' }}>Lớp đã dạy là lớp đã kết thúc và có ít nhất một học viên đăng ký, không tính lượt hủy.</p>
      </section>

      {memberPopupId && <MemberProfilePopup id={memberPopupId} onClose={() => setMemberPopupId(null)} />}
      {detail && (
        <ClassDetailModal
          cls={detail}
          regs={regs.filter((r) => r.class.id === detail.id)}
          trainers={trainers}
          act={act}
          onClose={() => setDetailId(null)}
        />
      )}
      {templating && <TemplateModal onClose={() => setTemplating(false)} />}
    </>
  )
}

function GridRow({ slot, days, today, items, regs, fillTone, onOpen }: { slot: string; days: string[]; today: string; items: GroupClass[]; regs: GroupReg[]; fillTone: (c: GroupClass) => string; onOpen: (id: string) => void }) {
  return (
    <>
      <div className="gcal-time"><span>{hm(items[0]?.start_at, slot)}</span><span>- {hm(items[0]?.end_at)}</span></div>
      {days.map((d) => {
        const cell = items.filter((c) => localISO(new Date(c.start_at)) === d)
        return (
          <div key={d} className={`gcal-cell${d === today ? ' today' : ''}`}>
            {cell.length === 0 && <span className="gcal-empty">-</span>}
            {cell.map((c) => {
              const mine = regs.filter((r) => r.class.id === c.id && r.status !== 'cancelled' && r.status !== 'waitlist')
              const tone = fillTone(c)
              return (
                <div key={c.id} className={`gcal-card ${tone}${c.status === 'completed' ? ' done' : ''}`}>
                  <button type="button" className="gcal-open" onClick={() => onOpen(c.id)}>
                  <span className="gcal-title">{classTitle(c.title)}{c.muscle_group ? ` + ${c.muscle_group}` : ''}</span>
                  <span className="gcal-pt">{ptName(c.trainer)}</span>
                  <span className="gcal-bar">{Array.from({ length: Math.max(1, c.capacity) }, (_, k) => <span key={k} className={k < c.registered ? 'on' : ''} />)}</span>
                  <span className="gcal-chips">{mine.map((r) => <span key={r.id} className={`gcal-chip${r.status === 'absent' ? ' bad' : ''}`}>{r.name}</span>)}</span>
                  </button>
                </div>
              )
            })}
          </div>
        )
      })}
    </>
  )
}

function MemberProfilePopup({ id, onClose }: { id: string; onClose: () => void }) {
  const [m, setM] = useState<Member | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.get<{ data: Member }>(`/members/${id}`).then((r) => setM(r.data.data)).catch((e) => setError(apiError(e).message))
  }, [id])
  if (error) return <Modal title="Hội viên" onClose={onClose} footer={<Button onClick={onClose}>Đóng</Button>}><div className="form-error" role="alert">{error}</div></Modal>
  if (!m) return null
  return <MemberProfile member={m} canEdit={false} onEdit={() => {}} onUpdated={(u) => setM((p) => (p ? { ...p, ...u } : p))} onClose={onClose} />
}

function RegistrationsPanel({ regs, act }: { regs: GroupReg[]; act: (url: string, ok: string, body?: object) => void }) {
  const { can } = usePermission()
  const { user } = useAuth()
  const [confirming, setConfirming] = useState<GroupReg | null>(null)
  const override = !!user?.roles.some((r) => LOCK_OVERRIDE_ROLES.includes(r))
  const rows = [...regs].sort((a, b) => b.created_at.localeCompare(a.created_at) || a.name.localeCompare(b.name))
  const cols: Column<GroupReg>[] = [
    { key: 'at', header: 'Time', sortValue: (r) => r.created_at, render: (r) => fmtDateTime(r.created_at) },
    { key: 'name', header: 'Tên', sortValue: (r) => r.name, render: (r) => <span className="cell-main">{r.name}</span> },
    { key: 'phone', header: 'Số điện thoại', render: (r) => r.phone },
    { key: 'email', header: 'Email', render: (r) => r.email ?? '-' },
    { key: 'class', header: 'Lớp', sortValue: (r) => r.class.start_at, render: (r) => <><div className="reg-when">{weekdayOf(r.class.start_at)}, {dmyLocal(r.class.start_at)} {fmtTime(r.class.start_at)}</div><div className="cell-sub">{classTitle(r.class.title)}{r.class.muscle_group ? ` + ${r.class.muscle_group}` : ''}</div></> },
    { key: 'status', className: 'reg-status', header: 'Tình trạng', sortValue: (r) => r.status, render: (r) => { const t = regTone(r); return <Chip tone={t.tone}>{t.label}</Chip> } },
    {
      key: 'act', header: '', className: 'reg-act',
      render: (r) => {
        if (!can('pt_sessions.cancel')) return null
        const open = r.status === 'booked' || r.status === 'waitlist'
        const locked = open && Date.now() >= cancelLockAt(r.class.start_at) && !override
        const why = !open ? (r.status === 'cancelled' ? 'Đăng ký này đã hủy' : 'Lớp đã diễn ra, không hủy được') : locked ? 'Đã khóa hủy từ 21h hôm trước' : undefined
        return <Button small variant="danger" disabled={!open || locked} title={why} onClick={() => setConfirming(r)}>Hủy</Button>
      },
    },
  ]
  return (
    <>
      <Panel title="Danh sách đăng ký" count={`${rows.length} đăng ký`} flush>
        <div className="reg-table">
          <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} pageSize={10} pageSizes={[10, 25, 50]} emptyText="Chưa có đăng ký trong tuần" itemLabel="đăng ký" />
        </div>
      </Panel>
      {confirming && (
        <ConfirmDialog
          title="Hủy đăng ký"
          danger
          confirmLabel="Xác nhận hủy"
          message={confirming.status === 'waitlist' ? `Bỏ ${confirming.name} khỏi danh sách chờ của lớp này?` : `Hủy chỗ của ${confirming.name} trong lớp này? Buổi đã tạm trừ sẽ được trả lại cho khách.`}
          onClose={() => setConfirming(null)}
          onConfirm={() => {
            const r = confirming
            setConfirming(null)
            act(`/pt/classes/registrations/${r.id}/cancel`, r.status === 'waitlist' ? 'Đã bỏ khỏi danh sách chờ' : 'Đã hủy chỗ, đã trả buổi cho khách')
          }}
        />
      )}
    </>
  )
}

function ClassDetailModal({ cls, regs, trainers, act, onClose }: { cls: GroupClass; regs: GroupReg[]; trainers: Trainer[]; act: (url: string, ok: string, body?: object) => void; onClose: () => void }) {
  const { can } = usePermission()
  const { user } = useAuth()
  const admin = !!user?.roles.some((r) => LOCK_OVERRIDE_ROLES.includes(r))
  const locked = Date.now() >= cancelLockAt(cls.start_at) && !admin
  const [confirming, setConfirming] = useState<GroupReg | null>(null)
  const rows = regs.filter((r) => r.status !== 'cancelled')
  const cols: Column<GroupReg>[] = [
    { key: 'name', header: 'Khách hàng', sortValue: (r) => r.name, render: (r) => <><span className="cell-main">{r.name}</span><div className="cell-sub">{r.phone}</div></> },
    { key: 'status', header: 'Trạng thái', sortValue: (r) => r.status, render: (r) => (r.status === 'booked' ? <Chip tone="ok">Có mặt</Chip> : <Chip tone={REG_STATUS[r.status].tone}>{REG_STATUS[r.status].label}</Chip>) },
    { key: 'left', header: 'Còn lại / hủy', numeric: true, sortValue: (r) => r.sessions_left ?? 0, render: (r) => `${r.sessions_left ?? '-'} / ${r.cancel_count ?? 0}` },
    {
      key: 'act',
      header: '',
      render: (r) => (
        <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          {r.status !== 'cancelled' && r.status !== 'waitlist' && admin && can('pt_sessions.complete') && (
            <>
              <Button small variant={r.status === 'attended' ? 'primary' : 'secondary'} onClick={() => act(`/pt/classes/registrations/${r.id}/attendance`, 'Đã ghi nhận có mặt', { status: 'attended' })}>Có mặt</Button>
              <Button small variant={r.status === 'absent' ? 'danger' : 'secondary'} onClick={() => act(`/pt/classes/registrations/${r.id}/attendance`, 'Đã ghi nhận vắng, khách mất buổi', { status: 'absent' })}>Vắng</Button>
            </>
          )}
          {(r.status === 'booked' || r.status === 'waitlist') && can('pt_sessions.cancel') && (
            <Button small variant="danger" disabled={locked} title={locked ? 'Chỉ hủy được trước 21:00 ngày hôm trước' : undefined} onClick={() => setConfirming(r)}>Hủy</Button>
          )}
        </span>
      ),
    },
  ]
  const open = cls.status === 'scheduled'
  const vnDay = (d: Date) => new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 10)
  const notToday = !admin && vnDay(new Date(cls.start_at)) !== vnDay(new Date())
  return (
    <Modal
      title={`${classTitle(cls.title)}${cls.muscle_group ? ` - ${cls.muscle_group}` : ''} | ${ptName(cls.trainer)}`}
      size="large"
      onClose={onClose}
      footer={open ? (
        <>
          {can('pt_sessions.create') && (
            <Select aria-label="Chọn PT" style={{ width: 'auto', minWidth: 0, flex: '0 0 auto' }} value={cls.trainer?.id ?? ''} onChange={(e) => e.target.value && act(`/pt/classes/${cls.id}/trainer`, 'Đã chọn PT cho lớp', { trainer_id: e.target.value })}>
              <option value="" disabled>Chọn PT</option>
              {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          )}
          {can('pt_sessions.complete') && <Button variant="primary" disabled={notToday || !cls.trainer} title={!cls.trainer ? 'Gán PT cho lớp trước khi hoàn thành' : notToday ? 'Chỉ hoàn thành được buổi dạy trong ngày hôm đó' : undefined} onClick={() => act(`/pt/classes/${cls.id}/complete`, 'Đã xác nhận dạy xong lớp')}>Hoàn thành buổi</Button>}
        </>
      ) : undefined}
    >
      <div className="table-wrap">
        <table className="table">
          <thead><tr>{cols.map((c) => <th key={c.key} className={c.numeric ? 'num' : ''}>{c.header}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={cols.length}><div className="empty">Chưa có khách đăng ký</div></td></tr>
              : rows.map((r) => <tr key={r.id}>{cols.map((c) => <td key={c.key} className={c.numeric ? 'num' : ''}>{c.render(r)}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
      {confirming && (
        <ConfirmDialog
          title="Hủy chỗ của hội viên"
          danger
          confirmLabel="Xác nhận hủy"
          message={confirming.status === 'waitlist' ? `Bỏ ${confirming.name} khỏi danh sách chờ của lớp này?` : `Hủy chỗ của ${confirming.name} trong lớp này? Buổi đã tạm trừ sẽ được trả lại cho khách.`}
          onClose={() => setConfirming(null)}
          onConfirm={() => {
            const r = confirming
            setConfirming(null)
            act(`/pt/classes/registrations/${r.id}/cancel`, r.status === 'waitlist' ? 'Đã bỏ khỏi danh sách chờ' : 'Đã hủy chỗ, đã trả buổi cho khách')
          }}
        />
      )}
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
