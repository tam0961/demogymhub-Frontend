import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtTime } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import { RequirePermission, usePermission } from '../context/usePermission'
import { Modal } from '../components/Modal'
import { PtBookModal } from '../components/PtBookModal'
import { Button, Input, Kpi, KpiRow, Segmented, useToast } from '../components/ui'
import { isLateCancel } from '../lib/pt'
import type { PtSession, PtStatus } from '../types'

interface Trainer { id: string; name: string }
type Mode = 'day' | 'week'

const PT_COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c6)', 'var(--c4)', 'var(--c5)']
const ROW = 22

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

export default function PtOne() {
  const { branchId } = useBranch()
  const { can, hasRole } = usePermission()
  const toast = useToast()
  const [mode, setMode] = useState<Mode>('day')
  const [day, setDay] = useState(localISO(new Date()))
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [rows, setRows] = useState<PtSession[]>([])
  const [error, setError] = useState('')
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
  const maxEnd = Math.max((mode === 'day' ? 22 : 21) * 60 + 60, ...rows.map((r) => Math.ceil(minutesOf(r.end_at) / 60) * 60))
  const slots = Array.from({ length: Math.round((maxEnd - minStart) / 30) }, (_, i) => minStart + i * 30)

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
        <h1>Lịch PT</h1>
        <div className="ptg-controls">
          <Segmented<Mode> ariaLabel="Chế độ xem" options={[{ value: 'day', label: 'Hôm nay' }, { value: 'week', label: 'Lịch Tuần' }]} value={mode} onChange={(m) => { setMode(m); if (m === 'day') setDay(localISO(new Date())) }} />
          <Button onClick={() => setDay(addDays(day, mode === 'day' ? -1 : -7))} aria-label="Lùi">‹</Button>
          <Input type="date" aria-label="Ngày" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          {mode === 'day' && <span className="ptg-dayname">{dayText(day)}{day === localISO(new Date()) ? ' (hôm nay)' : ''}</span>}
          <Button onClick={() => setDay(addDays(day, mode === 'day' ? 1 : 7))} aria-label="Tiến">›</Button>
          <Button onClick={() => setDay(localISO(new Date()))}>Hôm nay</Button>
          <RequirePermission permission="pt_sessions.create"><Button variant="primary" onClick={() => setAdding({ date: day })}>Thêm buổi PT</Button></RequirePermission>
        </div>
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}

      <div className="ptg-legend">
        {(['booked', 'done', 'noshow', 'cancel', 'blank'] as CardState[]).map((k) => (
          <span key={k}><i className={`ptg-sw ptg-${k}`} />{STATE_LABEL[k]}</span>
        ))}
      </div>
      {mode === 'day' && trainers.length > 0 && (
        <div className="ptg-legend">
          <span>Vạch màu bên trái ô là PT:</span>
          {trainers.map((t) => <span key={t.id}><i className="ptg-sw" style={{ background: colorOf(t.id) }} />{t.name}</span>)}
        </div>
      )}

      <div className="ptg-scroll">
        <div className="ptg" style={{ gridTemplateColumns: `64px repeat(${Math.max(cols.length, 1)}, minmax(150px, 1fr))` }}>
          <div className="ptg-corner" />
          {cols.map((c) => (
            <div key={c.key} className="ptg-head" style={{ borderTopColor: c.color }}>
              <b>{c.title}</b>
              <small>{c.items.filter((i) => i.status !== 'cancelled').length} buổi</small>
            </div>
          ))}
          {cols.length === 0 && <div className="ptg-head"><small>Chưa có PT trong chi nhánh</small></div>}
          <div className="ptg-axis">
            {slots.map((m) => <div key={m} className={m % 60 === 0 ? 'ptg-hr' : 'ptg-half'}>{m % 60 === 0 ? `${pad(m / 60)}:00` : ':30'}</div>)}
          </div>
          {cols.map((c) => (
            <div key={c.key} className="ptg-col" style={{ height: slots.length * ROW }}>
              {slots.map((m, i) => (
                <button
                  key={m}
                  type="button"
                  className={`ptg-cell ${m % 60 === 0 ? '' : 'half'}`}
                  style={{ top: i * ROW, height: ROW }}
                  aria-label={`Thêm buổi ${pad(Math.floor(m / 60))}:${pad(m % 60)}`}
                  disabled={!can('pt_sessions.create')}
                  onClick={() => setAdding({ trainerId: c.trainerId, date: c.date, time: `${pad(Math.floor(m / 60))}:${pad(m % 60)}` })}
                />
              ))}
              {c.items.map((s) => {
                const st = cardState(s)
                const top = ((minutesOf(s.start_at) - minStart) / 30) * ROW
                const h = Math.max(ROW, ((minutesOf(s.end_at) - minutesOf(s.start_at)) / 30) * ROW)
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={`ptg-card ptg-${st}`}
                    style={{ top: top + 1, height: h - 2, ['--pt' as string]: colorOf(s.trainer.id) }}
                    title={`${s.trainer.name} ${fmtTime(s.start_at)} - ${fmtTime(s.end_at)}`}
                    onClick={() => setPicked(s)}
                  >
                    {mode === 'week' && <span className="ptg-pt">{s.trainer.name}</span>}
                    <span className="ptg-line">
                      <b className={st === 'cancel' ? 'strike' : ''}>{s.member?.name ?? 'Chưa có khách'}</b>
                      {st !== 'blank' && <em>{STATE_LABEL[st]}</em>}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <KpiRow>
        <Kpi value={live.length} label="Số buổi trong khoảng xem" />
        <Kpi value={rows.filter((r) => r.status === 'scheduled').length} label="Đã đặt, chưa dạy" />
        <Kpi value={rows.filter((r) => r.status === 'completed').length} label="Hoàn thành, đã trừ buổi" />
        <Kpi value={rows.filter((r) => r.status === 'no_show' || r.status === 'cancelled').length} label="Vắng hoặc hủy" />
      </KpiRow>
      <p className="ptg-note">
        Màu ô là trạng thái buổi; vạch màu bên trái ô là PT. Ô nét đứt là ca PT đã báo nhưng chưa có khách: bấm vào để gán khách.
        Bấm vào ô trống để thêm buổi, bấm vào một buổi để gán khách, hoàn thành, ghi vắng mặt, sửa lịch hoặc hủy.
      </p>

      {picked && (
        <Modal
          title={picked.member?.name ?? 'Ca chưa có khách'}
          onClose={() => setPicked(null)}
          footer={
            <>
              <Button onClick={() => setPicked(null)}>Đóng</Button>
              {picked.status === 'scheduled' && can('pt_sessions.cancel') && <Button variant="danger" onClick={() => { setFree(false); setCancelling(picked); setPicked(null) }}>Hủy buổi</Button>}
              {picked.status === 'scheduled' && picked.member && (can('pt_sessions.complete') || can('pt_sessions.cancel')) && <Button onClick={() => act(picked, 'no-show')}>Vắng mặt</Button>}
              {picked.status === 'scheduled' && can('pt_sessions.create') && <Button onClick={() => { setEditing(picked); setPicked(null) }}>Sửa lịch</Button>}
              {picked.status === 'scheduled' && !picked.member && (can('pt_sessions.create') || can('pt_sessions.complete')) && <Button onClick={() => { setAssigning(picked); setPicked(null) }}>Gán khách</Button>}
              {picked.status === 'scheduled' && picked.member && can('pt_sessions.complete') && <Button variant="primary" onClick={() => act(picked, 'complete')}>Hoàn thành</Button>}
            </>
          }
        >
          <dl className="kv">
            <dt>PT</dt><dd>{picked.trainer.name}</dd>
            <dt>Giờ</dt><dd>{dayText(dayOf(picked.start_at))} {fmtTime(picked.start_at)} - {fmtTime(picked.end_at)}</dd>
            <dt>Khách</dt><dd>{picked.member ? `${picked.member.name} - ${picked.member.phone}` : 'Chưa có khách'}</dd>
            <dt>Hợp đồng</dt><dd>{picked.contract_code ? `${picked.contract_code} (còn ${picked.sessions_left ?? 0} buổi)` : '-'}</dd>
            <dt>Trạng thái</dt><dd>{STATE_LABEL[cardState(picked)]}</dd>
            {picked.note && <><dt>Ghi chú</dt><dd>{picked.note}</dd></>}
          </dl>
        </Modal>
      )}
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
      {adding && <PtBookModal day={day} trainers={trainers} initial={adding} onClose={() => setAdding(null)} onSaved={() => { setAdding(null); toast('Đã đặt buổi PT'); load() }} />}
    </>
  )
}
