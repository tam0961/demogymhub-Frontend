import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtTime } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import { RequirePermission, usePermission } from '../context/usePermission'
import { Modal } from '../components/Modal'
import { PtSignModal } from '../components/PtSignModal'
import { PtAddModal, PtAssignPanel, PtBookModal } from '../components/PtBookModal'
import { Button, Input, Kpi, KpiRow, Segmented, useToast } from '../components/ui'
import { isLateCancel } from '../lib/pt'
import { MemberAvatar } from '../components/MemberAvatar'
import type { Contract, Member, PtSession, PtStatus } from '../types'

interface Trainer { id: string; name: string; branches?: { id: string; name: string }[] }
type Mode = 'day' | 'week'

const PT_COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c6)', 'var(--c4)', 'var(--c5)']
const ROW = 26

const pad = (n: number) => String(n).padStart(2, '0')
const localISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + n)
  return localISO(d)
}
const mondayOf = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return localISO(d)
}
const dayText = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('vi-VN', { weekday: 'long' })
const shortDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })
const minutesOf = (iso: string) => {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}
const dayOf = (iso: string) => localISO(new Date(iso))

type CardState = 'booked' | 'done' | 'noshow' | 'cancel' | 'blank'
const STATE_LABEL: Record<CardState, string> = { booked: 'Đã đặt lịch', done: 'Đã dạy', noshow: 'Vắng mặt', cancel: 'Đã hủy', blank: 'Ca đã báo, chưa có khách' }
const cardState = (s: PtSession): CardState => {
  const map: Record<PtStatus, CardState> = { scheduled: 'booked', completed: 'done', no_show: 'noshow', cancelled: 'cancel' }
  return !s.member && s.status === 'scheduled' ? 'blank' : map[s.status]
}

const groupHistory = (items: PtSession[]): { s: PtSession; more: PtSession[] }[] => {
  const hist = items.filter((i) => i.source === 'gymmaster').sort((a, b) => a.start_at.localeCompare(b.start_at))
  const out = items.filter((i) => i.source !== 'gymmaster').map((s) => ({ s, more: [] as PtSession[] }))
  let cur: { s: PtSession; more: PtSession[]; end: number } | null = null
  for (const h of hist) {
    if (cur && new Date(h.start_at).getTime() < cur.end) {
      cur.more.push(h)
      cur.end = Math.max(cur.end, new Date(h.end_at).getTime())
    } else {
      if (cur) out.push({ s: cur.s, more: cur.more })
      cur = { s: h, more: [], end: new Date(h.end_at).getTime() }
    }
  }
  if (cur) out.push({ s: cur.s, more: cur.more })
  return out
}

const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

export default function PtOne() {
  const { branchId } = useBranch()
  const { can, hasRole } = usePermission()
  const toast = useToast()
  const [mode, setMode] = useState<Mode>('day')
  const [day, setDay] = useState(localISO(new Date()))
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [rows, setRows] = useState<PtSession[]>([])
  const [offs, setOffs] = useState<{ trainer_id: string; date: string }[]>([])
  const [error, setError] = useState('')
  const [signing, setSigning] = useState<PtSession | null>(null)
  const [adding, setAdding] = useState<{ trainerId?: string; date?: string; time?: string } | null>(null)
  const [assigning, setAssigning] = useState<PtSession | null>(null)
  const [picked, setPicked] = useState<PtSession | null>(null)
  const [editing, setEditing] = useState<PtSession | null>(null)
  const [cancelling, setCancelling] = useState<PtSession | null>(null)
  const [free, setFree] = useState(false)
  const canOverride = hasRole('super_admin') || hasRole('owner') || hasRole('branch_manager')

  const from = mode === 'day' ? day : mondayOf(day)
  const to = mode === 'day' ? day : addDays(from, 6)

  const load = useCallback(async () => {
    setError('')
    try {
      const { data } = await api.get<{ data: PtSession[] }>('/pt/sessions', { params: { from, to, branch_id: branchId ?? undefined } })
      setRows(data.data)
      api.get<{ data: { trainer_id: string; date: string }[] }>('/pt/off', { params: { from, to, branch_id: branchId ?? undefined } }).then((r) => setOffs(r.data.data)).catch(() => setOffs([]))
    } catch (e) {
      setError(apiError(e).message)
    }
  }, [from, to, branchId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    api.get<{ data: Trainer[] }>('/pt/trainers', { params: { branch_id: branchId ?? undefined } }).then((r) => setTrainers(r.data.data)).catch(() => setTrainers([]))
  }, [branchId])

  const colorOf = useMemo(() => {
    const m = new Map(trainers.map((t, i) => [t.id, PT_COLORS[i % PT_COLORS.length]]))
    return (id: string) => m.get(id) ?? PT_COLORS[5]
  }, [trainers])

  const days = useMemo(() => (mode === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(from, i)) : [day]), [mode, from, day])
  const cols = mode === 'day'
    ? trainers.map((t) => ({ key: t.id, title: t.name.startsWith('PT') ? t.name : `PT ${t.name}`, color: colorOf(t.id), date: day, trainerId: t.id, items: rows.filter((r) => r.trainer.id === t.id && dayOf(r.start_at) === day) }))
    : days.map((d) => ({ key: d, title: shortDay(d), color: 'var(--line-strong)', date: d, trainerId: undefined as string | undefined, items: rows.filter((r) => dayOf(r.start_at) === d) }))

  const minStart = Math.min(8 * 60, ...rows.map((r) => Math.floor(minutesOf(r.start_at) / 60) * 60))
  const maxEnd = Math.max(20 * 60, ...rows.map((r) => Math.ceil(minutesOf(r.end_at) / 60) * 60))
  const slots = Array.from({ length: Math.round((maxEnd - minStart) / 30) }, (_, i) => minStart + i * 30)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [row, setRow] = useState(ROW)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const fit = () => {
      const head = el.querySelector('.ptg-head') as HTMLElement | null
      const avail = el.clientHeight - (head?.offsetHeight ?? 52) - 2
      setRow(Math.max(18, Math.floor(avail / Math.max(1, slots.length))))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [slots.length])

  const isOff = (c: { trainerId?: string; date: string }) => !!c.trainerId && offs.some((o) => o.trainer_id === c.trainerId && o.date === c.date)

  const live = rows.filter((r) => r.status !== 'cancelled')
  const isLate = (s: PtSession) => !!s.member && isLateCancel(s.start_at)
  const act = async (s: PtSession, kind: 'complete' | 'cancel' | 'no-show', body?: object) => {
    try {
      const r = await api.post<{ data: PtSession }>(`/pt/sessions/${s.id}/${kind}`, body)
      toast(kind === 'complete' ? 'Đã xác nhận buổi tập' : kind === 'no-show' ? 'Đã ghi nhận vắng mặt, đã trừ 1 buổi' : r.data.data.status === 'no_show' ? 'Hủy sát giờ: tính là vắng mặt, đã trừ 1 buổi' : 'Đã hủy buổi')
      setPicked(null)
      setCancelling(null)
      load()
    } catch (e) {
      toast(apiError(e).message)
    }
  }

  return (
    <>
      <div className="page-head">
        <h1>Lịch PT 1-1</h1>
        <div className="ptg-controls">
          <Segmented<Mode> ariaLabel="Chế độ xem" options={[{ value: 'day', label: 'Hôm nay' }, { value: 'week', label: 'Lịch Tuần' }]} value={mode} onChange={(m) => { setMode(m); if (m === 'day') setDay(localISO(new Date())) }} />
          <span className="ptg-dayname" aria-hidden={mode !== 'day'}>{mode === 'day' ? dayText(day) : ''}</span>
          <Button onClick={() => setDay(addDays(day, mode === 'day' ? -1 : -7))} aria-label="Lùi">‹</Button>
          <Input type="date" aria-label="Ngày" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          <Button onClick={() => setDay(addDays(day, mode === 'day' ? 1 : 7))} aria-label="Tiến">›</Button>
          <Button className="ptg-today" onClick={() => setDay(localISO(new Date()))}>{mode === 'day' ? 'Hôm nay' : 'Tuần này'}</Button>
          <RequirePermission permission="pt_sessions.create"><Button variant="primary" onClick={() => setAdding({ date: day })}>Thêm buổi PT</Button></RequirePermission>
        </div>
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}

      <div className="ptg-scroll" ref={scrollRef}>
        <div className="ptg" style={{ ['--ptg-row' as string]: `${row}px`, gridTemplateColumns: `64px repeat(${Math.max(cols.length, 1)}, minmax(150px, 1fr))` }}>
          <div className="ptg-corner" />
          {cols.map((c) => (
            <div key={c.key} className={`ptg-head${isOff(c) ? ' off' : ''}`} style={{ borderTopColor: c.color }}>
              <b>{c.title}</b>
              <small>{isOff(c) ? 'OFF' : `${new Set(c.items.filter((i) => i.status !== 'cancelled' && i.member).map((i) => i.member!.id)).size} khách`}</small>
            </div>
          ))}
          {cols.length === 0 && <div className="ptg-head"><small>Chưa có PT trong chi nhánh</small></div>}
          <div className="ptg-axis">
            {slots.map((m) => <div key={m} className={m % 60 === 0 ? 'ptg-hr' : 'ptg-half'}>{m % 60 === 0 ? `${pad(m / 60)}:00` : ':30'}</div>)}
          </div>
          {cols.map((c) => (
            <div key={c.key} className={`ptg-col${isOff(c) ? ' ptg-off' : ''}`} style={{ height: slots.length * row }}>
              {slots.map((m, i) => (
                <button
                  key={m}
                  type="button"
                  className={`ptg-cell ${m % 60 === 0 ? '' : 'half'}`}
                  style={{ top: i * row, height: row }}
                  aria-label={`Thêm buổi ${pad(Math.floor(m / 60))}:${pad(m % 60)}`}
                  disabled={!can('pt_sessions.create') || isOff(c)}
                  onClick={() => setAdding({ trainerId: c.trainerId, date: c.date, time: `${pad(Math.floor(m / 60))}:${pad(m % 60)}` })}
                />
              ))}
              {groupHistory(c.items).map(({ s, more }) => {
                const st = cardState(s)
                const top = ((minutesOf(s.start_at) - minStart) / 30) * row
                const h = Math.max(row, ((minutesOf(s.end_at) - minutesOf(s.start_at)) / 30) * row)
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`ptg-card ptg-${st}`}
                    style={{ top: top + 1, height: h - 2, ['--pt' as string]: colorOf(s.trainer.id) }}
                    title={`${s.trainer.name} ${fmtTime(s.start_at)} - ${fmtTime(s.end_at)}${more.length ? `: ${[s, ...more].map((x) => x.member?.name ?? '').join(', ')}` : ''}`}
                    onClick={() => setPicked(s)}
                  >
                    {mode === 'week' && <span className="ptg-pt">{s.trainer.name}</span>}
                    <span className="ptg-line">
                      <b className={st === 'cancel' ? 'strike' : ''}>{more.length ? `${more.length + 1} buổi` : s.member?.name ?? 'Chưa có khách'}</b>
                      {st !== 'blank' && <em>{STATE_LABEL[st]}</em>}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <h2 className="ptg-stat-title">{mode === 'day' ? `Thống kê ngày ${dmy(day)}` : `Thống kê tuần ${dmy(from)} - ${dmy(to)}`}</h2>
      <KpiRow>
        <Kpi value={live.length} label={mode === 'day' ? 'Số buổi trong ngày' : 'Số buổi trong tuần'} />
        <Kpi value={rows.filter((r) => r.status === 'scheduled').length} label="Đã đặt, chưa dạy" />
        <Kpi value={rows.filter((r) => r.status === 'completed').length} label="Hoàn thành, đã trừ buổi" />
        <Kpi value={rows.filter((r) => r.status === 'no_show' || r.status === 'cancelled').length} label="Vắng hoặc hủy" />
      </KpiRow>
      <div className="ptg-rules">
        <div>
          <b>Điều kiện hoàn thành buổi</b>
          <span>Buổi đã có khách và là buổi dạy trong ngày, không hoàn thành trước cho ngày sau. Khách còn gói member và gói PT còn hạn sử dụng, hợp đồng còn buổi. Khách ký xác nhận thì mới trừ 1 buổi, và chỉ trừ một lần.</span>
        </div>
        <div>
          <b>Điều kiện hủy buổi</b>
          <span>Hủy trước giờ bắt đầu từ 90 phút trở lên: miễn phí, không trừ buổi. Hủy sát giờ, dưới 90 phút: tính là vắng mặt và trừ 1 buổi. Chỉ chủ hoặc quản lý được hủy miễn phí khi sát giờ.</span>
        </div>
        <div>
          <b>Điều kiện vắng mặt</b>
          <span>Dùng khi khách không đến buổi đã đặt. Buổi phải có khách và đang ở trạng thái đã đặt. Ghi vắng mặt sẽ trừ 1 buổi của khách.</span>
        </div>
      </div>

      {picked && (
        <Modal
          title={picked.member?.name ?? `Buổi PT ${fmtTime(picked.start_at)}`}
          size="xl"
          onClose={() => setPicked(null)}
          footer={
            <>
              <Button onClick={() => setPicked(null)}>Đóng</Button>
              {picked.status === 'scheduled' && can('pt_sessions.cancel') && <Button variant="danger" onClick={() => { setFree(false); setCancelling(picked); setPicked(null) }}>Hủy buổi</Button>}
              {picked.status === 'scheduled' && picked.member && (can('pt_sessions.complete') || can('pt_sessions.cancel')) && <Button onClick={() => act(picked, 'no-show')}>Vắng mặt</Button>}
              {picked.status === 'scheduled' && can('pt_sessions.create') && <Button onClick={() => { setEditing(picked); setPicked(null) }}>Sửa lịch</Button>}
              {picked.status === 'scheduled' && picked.member && can('pt_sessions.complete') && <Button variant="primary" disabled={!canOverride && new Date(Date.parse(picked.start_at) + 7 * 3600000).toISOString().slice(0, 10) !== new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)} title="Chỉ hoàn thành được buổi dạy trong ngày hôm đó" onClick={() => setSigning(picked)}>Hoàn thành</Button>}
            </>
          }
        >
          <div style={{ minHeight: 420 }}>
          {!picked.member && picked.status === 'scheduled' && (can('pt_sessions.create') || can('pt_sessions.complete')) ? (
            <>
              <dl className="kv">
                <dt>Huấn luyện viên</dt><dd>{picked.trainer.name}</dd>
                <dt>Giờ</dt><dd>{dmy(picked.start_at.slice(0, 10))} {fmtTime(picked.start_at)} - {fmtTime(picked.end_at)}</dd>
              </dl>
              <h3 style={{ margin: '16px 0 8px', fontSize: 14 }}>Chọn khách</h3>
              <PtAssignPanel session={picked} onAssigned={(s) => { toast('Đã chọn khách'); setPicked(s); load() }} />
            </>
          ) : (
            <PtMemberInfo session={picked} />
          )}
          </div>
        </Modal>
      )}
      {signing && <PtSignModal session={signing} onClose={() => setSigning(null)} onConfirmed={(x) => act(x, 'complete')} />}
      {cancelling && (
        <Modal
          title="Hủy buổi PT"
          onClose={() => setCancelling(null)}
          footer={<><Button onClick={() => setCancelling(null)}>Không hủy</Button><Button variant="danger" onClick={() => act(cancelling, 'cancel', free ? { cancel_free: true } : undefined)}>Xác nhận hủy</Button></>}
        >
          <p>Hủy trước giờ bắt đầu từ 90 phút trở lên thì miễn phí, không trừ buổi. Hủy sát giờ (dưới 90 phút) tính là vắng mặt và trừ 1 buổi.</p>
          {isLate(cancelling) && !free && <p className="form-error" role="alert">Buổi này bắt đầu trong chưa đầy 90 phút: hủy bây giờ sẽ bị trừ 1 buổi.</p>}
          {canOverride && cancelling.member && (
            <label className="check"><input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} /> Hủy miễn phí, không trừ buổi (chủ phòng hoặc quản lý duyệt)</label>
          )}
        </Modal>
      )}
      {editing && <PtBookModal day={day} trainers={trainers} edit={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); toast('Đã cập nhật lịch'); load() }} />}
      {assigning && <PtBookModal day={day} trainers={trainers} assign={assigning} onClose={() => setAssigning(null)} onSaved={() => { setAssigning(null); toast('Đã gán khách'); load() }} />}
      {adding && <PtAddModal day={day} trainers={trainers} initial={adding} onClose={() => setAdding(null)} onSaved={() => { setAdding(null); toast('Đã đặt buổi PT'); load() }} />}
    </>
  )
}

function PtMemberInfo({ session }: { session: PtSession }) {
  const [mem, setMem] = useState<Member | null>(null)
  const [pkg, setPkg] = useState<string | null>(null)
  const memberId = session.member?.id
  const contractId = session.contract_id
  useEffect(() => {
    setMem(null)
    if (memberId) api.get<{ data: Member }>(`/members/${memberId}`).then((r) => setMem(r.data.data)).catch(() => setMem(null))
  }, [memberId])
  useEffect(() => {
    setPkg(null)
    if (contractId) api.get<{ data: Contract }>(`/contracts/${contractId}`).then((r) => setPkg(r.data.data.package.name)).catch(() => setPkg(null))
  }, [contractId])
  return (
    <div className="pt-detail">
      {session.member && <MemberAvatar member={{ id: session.member.id, name: session.member.name, has_photo: mem?.has_photo, photo_version: mem?.photo_version, avatar_url: mem?.avatar_url }} size={180} />}
      <dl className="kv">
        <dt>PT</dt><dd>{session.trainer.name}</dd>
        <dt>Giờ</dt><dd>{dayText(dayOf(session.start_at))} {fmtTime(session.start_at)} - {fmtTime(session.end_at)}</dd>
        <dt>Khách</dt><dd>{session.member ? `${session.member.name} - ${session.member.phone}` : 'Chưa có khách'}</dd>
        <dt>Gói tập</dt><dd>{pkg ?? '-'}</dd>
        <dt>Số buổi còn lại</dt><dd>{session.contract_id ? `${session.sessions_left ?? 0} buổi` : '-'}</dd>
        <dt>Trạng thái</dt><dd>{STATE_LABEL[cardState(session)]}</dd>
        {session.note && <><dt>Ghi chú</dt><dd>{session.note}</dd></>}
      </dl>
    </div>
  )
}
