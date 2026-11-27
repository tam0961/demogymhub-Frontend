import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDate, fmtMoney, fmtTime, initials } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import './ptApp.css'

type Tab = 'home' | 'schedule' | 'clients' | 'leads' | 'settings'
type Sub = null | 'stats' | 'off'

interface Person { id: string; code: string; name: string; phone: string }
interface Sess { id: string; start_at: string; end_at: string; status: string; note: string | null; kind: 'pt_1on1' | 'pt_1on2'; member: Person | null; contract_code: string | null; sessions_left: number | null }
interface Cls { id: string; title: string | null; muscle_group: string | null; trainer: { id: string; name: string } | null; mine: boolean; start_at: string; end_at: string; capacity: number; status: string; registered: number; registrations: { id: string; name: string; phone: string; status: string }[] }
interface Ctr { id: string; code: string; status: string; member: Person; package_name: string; category: string; sessions_total: number | null; sessions_left: number | null; start_date: string | null; end_date: string | null; total_amount: number; paid_amount: number; last_active: string | null; off_track: boolean }
interface LeadRow { id: string; name: string; phone: string; source: string | null; interest: string | null; status: string; note: string | null; created_at: string }

const pad = (n: number) => String(n).padStart(2, '0')
const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDay = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return localDay(d)
}
const mondayOf = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`)
  return addDay(iso, -((d.getDay() + 6) % 7))
}
const monthStart = (iso: string) => `${iso.slice(0, 8)}01`
const dayOf = (iso: string) => localDay(new Date(iso))
const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const dow = (iso: string) => WEEKDAY[new Date(`${iso}T00:00:00`).getDay()]
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })
const givenName = (n: string) => n.replace(/^PT\s+/i, '').trim().split(/\s+/).pop() ?? ''
const tel = (p: string) => <a className="pta-tel" href={`tel:${p}`}>{p}</a>

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'mute'
const SESSION_STATUS: Record<string, { tone: Tone; label: string }> = {
  scheduled: { tone: 'info', label: 'Sắp diễn ra' },
  completed: { tone: 'ok', label: 'Đã hoàn thành' },
  cancelled: { tone: 'bad', label: 'Đã hủy' },
  no_show: { tone: 'warn', label: 'Vắng' },
}
const CONTRACT_STATUS: Record<string, { tone: Tone; label: string }> = {
  active: { tone: 'ok', label: 'Đang tập' },
  expired: { tone: 'bad', label: 'Hết hạn' },
  frozen: { tone: 'warn', label: 'Tạm ngưng' },
  signed: { tone: 'warn', label: 'Chưa kích hoạt' },
  draft: { tone: 'mute', label: 'Nháp' },
  cancelled: { tone: 'bad', label: 'Đã hủy' },
}
const CAT: Record<string, string> = { pt_1on1: 'PT 1:1', pt_1on2: 'PT 1:2', pt_group: 'PT nhóm' }
const LEAD_STATUS: Record<string, string> = { new: 'Mới', contacted: 'Đã liên hệ', trial_booked: 'Hẹn tập thử', converted: 'Đã chốt', lost: 'Không chốt' }

const Pill = ({ tone, children }: { tone: Tone; children: ReactNode }) => <span className={`pta-pill pta-${tone}`}>{children}</span>
const Avatar = ({ name }: { name: string }) => <span className={`pta-av pta-av${(name.charCodeAt(0) || 0) % 5}`} aria-hidden="true">{initials(name)}</span>
const Empty = ({ text }: { text: string }) => <p className="pta-empty">{text}</p>

const PATHS: Record<string, string> = {
  home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  schedule: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  clients: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 20a5 5 0 0 0-4-5',
  leads: 'M12 2l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17l-5.9 3 1.2-6.5L2.5 8.9 9.1 8z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  stats: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z',
  chat: 'M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-5.4A8 8 0 1 1 21 12z',
  cal: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
}
const Ico = ({ n, size = 22 }: { n: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={PATHS[n]} /></svg>
)

function useLoad<T>(path: string, params?: Record<string, string>) {
  const [rows, setRows] = useState<T[]>([])
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const key = JSON.stringify(params ?? {})
  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get(path, { params: JSON.parse(key) })
      setRows(data.data)
      setErr('')
    } catch (e) {
      setErr(apiError(e).message)
    } finally {
      setLoading(false)
    }
  }, [path, key])
  useEffect(() => { void reload() }, [reload])
  return { rows, err, loading, reload }
}

function Page({ title, onBack, children }: { title: string; onBack?: () => void; children: ReactNode }) {
  return (
    <>
      <header className="pta-head">
        {onBack ? <button type="button" className="pta-ib" aria-label="Quay lại" onClick={onBack}><Ico n="back" /></button> : <span className="pta-ib" />}
        <h1>{title}</h1>
        <span className="pta-ib" />
      </header>
      <div className="pta-body">{children}</div>
    </>
  )
}

function Chips<T extends string>({ items, value, onChange }: { items: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  return (
    <div className="pta-chips" role="tablist">
      {items.map((i) => (
        <button key={i.key} type="button" role="tab" aria-selected={value === i.key} className={value === i.key ? 'on' : ''} onClick={() => onChange(i.key)}>{i.label}</button>
      ))}
    </div>
  )
}

interface Shared {
  month: ReturnType<typeof useLoad<Sess>>
  contracts: ReturnType<typeof useLoad<Ctr>>
  leads: ReturnType<typeof useLoad<LeadRow>>
}

function useComplete(reload: () => Promise<void>) {
  const toast = useToast()
  const [busy, setBusy] = useState('')
  const complete = async (id: string) => {
    setBusy(id)
    try {
      await api.post(`/pt/sessions/${id}/complete`, {})
      toast('Đã xác nhận buổi dạy')
      await reload()
    } catch (e) {
      toast(apiError(e).message, true)
    } finally {
      setBusy('')
    }
  }
  return { busy, complete }
}

function NoteBox({ s, onSaved }: { s: Sess; onSaved: () => void }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(s.note ?? '')
  const save = async () => {
    try {
      await api.patch(`/pt-app/sessions/${s.id}/note`, { note: text.trim() || null })
      toast('Đã lưu ghi chú')
      setOpen(false)
      onSaved()
    } catch (e) {
      toast(apiError(e).message, true)
    }
  }
  if (!open) {
    return (
      <div>
        {s.note && <div className="pta-sub">Ghi chú: {s.note}</div>}
        <button type="button" className="pta-link pta-link0" onClick={() => setOpen(true)}>{s.note ? 'Sửa ghi chú' : 'Ghi chú buổi tập'}</button>
      </div>
    )
  }
  return (
    <div className="pta-edit pta-edit0">
      <textarea className="pta-select" aria-label="Ghi chú buổi tập" rows={3} placeholder="Kết quả, mục tiêu, lưu ý cho buổi sau..." value={text} onChange={(e) => setText(e.target.value)} />
      <div className="pta-actions">
        <button type="button" className="pta-cta dark" onClick={() => setOpen(false)}>Đóng</button>
        <button type="button" className="pta-cta" onClick={save}>Lưu</button>
      </div>
    </div>
  )
}

function SessionCard({ g, today, busy, onDone, onSaved }: { g: Sess[]; today: string; busy: string; onDone: (id: string) => void; onSaved: () => void }) {
  const f = g[0]
  const st = SESSION_STATUS[f.status] ?? SESSION_STATUS.scheduled
  const canDone = dayOf(f.start_at) <= today
  return (
    <article className="pta-sess">
      <div className="pta-time">{fmtTime(f.start_at)} – {fmtTime(f.end_at)}</div>
      <div className="pta-box">
        <div className="pta-boxhead">
          <b>{f.kind === 'pt_1on2' ? 'PT 1:2' : 'PT 1:1'}</b>
          <Pill tone={st.tone}>{st.label}</Pill>
        </div>
        {g.map((s) => (
          <div key={s.id} className="pta-one">
          <div className="pta-who">
            <Avatar name={s.member?.name ?? '?'} />
            <div className="pta-grow">
              <div className="pta-name">{s.member?.name ?? 'Chưa gán khách'}</div>
              {s.member && <div className="pta-sub">{tel(s.member.phone)} · còn {s.sessions_left ?? '-'} buổi</div>}
            </div>
            {s.status === 'scheduled' && s.member && canDone && (
              <button type="button" className="pta-btn" disabled={busy === s.id} onClick={() => onDone(s.id)}>Đã dạy</button>
            )}
          </div>
          {s.member && <NoteBox s={s} onSaved={onSaved} />}
          </div>
        ))}
      </div>
    </article>
  )
}

const groupSessions = (rows: Sess[]) => {
  const out: Sess[][] = []
  for (const s of rows) {
    const g = out.find((x) => x[0].start_at === s.start_at && x[0].kind === 'pt_1on2' && s.kind === 'pt_1on2')
    if (g) g.push(s)
    else out.push([s])
  }
  return out
}

function Home({ d, go, name }: { d: Shared; go: (t: Tab, s?: Sub) => void; name: string }) {
  const today = localDay()
  const cls = useLoad<Cls>('/pt-app/classes', { from: today, to: today })
  const { busy, complete } = useComplete(d.month.reload)
  const todays = d.month.rows.filter((s) => dayOf(s.start_at) === today && s.status !== 'cancelled')
  const myClasses = cls.rows.filter((c) => c.mine && c.status !== 'cancelled')
  const now = Date.now()
  const pending = todays.filter((s) => s.status === 'scheduled' && s.member && new Date(s.start_at).getTime() <= now)
  const newLeads = d.leads.rows.filter((l) => l.status === 'new')
  const active = d.contracts.rows.filter((c) => c.status === 'active')
  const soon = active.filter((c) => (c.sessions_left != null && c.sessions_left <= 3) || (c.end_date && new Date(c.end_date).getTime() - now <= 7 * 86400000))
  const debts = active.filter((c) => c.total_amount - c.paid_amount > 0)
  const offTrack = active.filter((c) => c.off_track)
  const week = mondayOf(today)
  const weekDone = d.month.rows.filter((s) => s.status === 'completed' && dayOf(s.start_at) >= week).length
  const items = [
    ...todays.map((s) => ({ t: s.start_at, e: s.end_at, label: s.kind === 'pt_1on2' ? 'PT 1:2' : 'PT 1:1', sub: s.member?.name ?? 'Chưa gán khách', status: s.status })),
    ...myClasses.map((c) => ({ t: c.start_at, e: c.end_at, label: 'PT nhóm', sub: `${c.title || c.muscle_group || 'Lớp nhóm'} · ${c.registered}/${c.capacity}`, status: c.status })),
  ].sort((a, b) => a.t.localeCompare(b.t))
  const err = d.month.err || d.contracts.err || d.leads.err || cls.err

  return (
    <>
      <section className="pta-hero">
        <div className="pta-logo"><b>TH</b> GYM &amp; FITNESS</div>
        <h1>Xin chào, {givenName(name)}</h1>
        <p>Chúc bạn một ngày dạy thật tốt</p>
      </section>
      <div className="pta-body pta-up">
        {err && <p className="pta-err">{err}</p>}
        <section className="pta-card">
          <header className="pta-cardhead"><b><Ico n="cal" size={18} /> Lịch làm việc hôm nay</b><span className="pta-sub">{dayLabel(today)}</span></header>
          {items.length === 0 && <Empty text="Hôm nay không có ca dạy." />}
          {items.map((i) => {
            const st = SESSION_STATUS[i.status] ?? SESSION_STATUS.scheduled
            return (
              <div key={i.t + i.label + i.sub} className="pta-row">
                <span className="pta-chiptime">{fmtTime(i.t)} – {fmtTime(i.e)}</span>
                <div className="pta-grow"><b>{i.label}</b><div className="pta-sub">{i.sub}</div></div>
                <Pill tone={st.tone}>{st.label}</Pill>
              </div>
            )
          })}
        </section>

        <div className="pta-menu">
          <button type="button" onClick={() => go('schedule')}><Ico n="schedule" /><span>Lịch tập</span></button>
          <button type="button" onClick={() => go('home', 'stats')}><Ico n="stats" /><span>Thống kê</span></button>
          <button type="button" onClick={() => go('leads')}><Ico n="leads" /><span>Giao lead</span>{newLeads.length > 0 && <i className="pta-dot">{newLeads.length}</i>}</button>
          <button type="button" onClick={() => go('clients')}><Ico n="clients" /><span>Khách hàng</span></button>
        </div>

        <section className="pta-card">
          <header className="pta-cardhead"><b>Việc phải làm</b></header>
          {pending.length + newLeads.length + soon.length + debts.length + offTrack.length === 0 && <Empty text="Không có việc tồn đọng." />}
          {pending.map((s) => (
            <div key={s.id} className="pta-row">
              <div className="pta-grow"><b>Xác nhận đã dạy</b><div className="pta-sub">{fmtTime(s.start_at)} · {s.member?.name}</div></div>
              <button type="button" className="pta-btn" disabled={busy === s.id} onClick={() => complete(s.id)}>Đã dạy</button>
            </div>
          ))}
          {newLeads.length > 0 && <button type="button" className="pta-task" onClick={() => go('leads')}><b>{newLeads.length} lead mới</b> chưa liên hệ: {newLeads.slice(0, 3).map((l) => l.name).join(', ')}{newLeads.length > 3 ? '...' : ''}</button>}
          {soon.length > 0 && <button type="button" className="pta-task" onClick={() => go('clients')}><b>{soon.length} khách</b> sắp hết buổi hoặc hết hạn: {soon.slice(0, 3).map((c) => c.member.name).join(', ')}{soon.length > 3 ? '...' : ''}</button>}
          {offTrack.length > 0 && <button type="button" className="pta-task" onClick={() => go('clients', 'off')}><b>{offTrack.length} khách off track</b> (quá 14 ngày chưa tập): {offTrack.slice(0, 3).map((c) => c.member.name).join(', ')}{offTrack.length > 3 ? '...' : ''}</button>}
          {debts.length > 0 && <button type="button" className="pta-task" onClick={() => go('clients')}><b>{debts.length} khách</b> còn nợ hợp đồng</button>}
        </section>

        <section className="pta-perf">
          <header><b>Hiệu suất tuần này</b><button type="button" onClick={() => go('home', 'stats')}>Xem chi tiết ›</button></header>
          <div>
            <span><b>{weekDone}</b>Buổi PT</span>
            <span><b>{active.length}</b>Khách hàng</span>
            <span><b>{todays.length + myClasses.length}</b>Ca hôm nay</span>
          </div>
        </section>
      </div>
    </>
  )
}

function ClassAttend({ c, today, onChanged }: { c: Cls; today: string; onChanged: () => void }) {
  const toast = useToast()
  const [busy, setBusy] = useState('')
  const finish = async () => {
    setBusy(c.id)
    try {
      await api.post(`/pt/classes/${c.id}/complete`, {})
      toast('Đã hoàn thành lớp')
      onChanged()
    } catch (e) {
      toast(apiError(e).message, true)
    } finally {
      setBusy('')
    }
  }
  const canMark = dayOf(c.start_at) === today && c.status !== 'cancelled'
  return (
    <div className="pta-attend">
      {c.registered === 0 && <div className="pta-sub">Chưa có học viên đăng ký.</div>}
      {c.registered > 0 && c.registrations.length === 0 && <div className="pta-sub">{c.registered} học viên đăng ký.</div>}
      {c.registrations.map((r) => (
        <div key={r.id} className="pta-att">
          <span className="pta-grow">{r.name} {tel(r.phone)}</span>
          <span className="pta-sub">{r.status === 'absent' ? 'Vắng' : 'Có mặt'}</span>
        </div>
      ))}
      {canMark && c.status === 'scheduled' && <button type="button" className="pta-cta" disabled={busy === c.id} onClick={finish}>Hoàn thành lớp</button>}
    </div>
  )
}

function Schedule({ d }: { d: Shared }) {
  const today = localDay()
  const [seg, setSeg] = useState<'pt' | 'class'>('pt')
  const [day, setDay] = useState(today)
  const week = mondayOf(day)
  const days = Array.from({ length: 7 }, (_, i) => addDay(week, i))
  const sess = useLoad<Sess>('/pt-app/schedule', { from: week, to: addDay(week, 6) })
  const cls = useLoad<Cls>('/pt-app/classes', { from: week, to: addDay(week, 6) })
  const off = useLoad<string>('/pt-app/off', { from: week, to: addDay(week, 6) })
  const toast = useToast()
  const isOff = off.rows.includes(day)
  const toggleOff = async () => {
    try {
      await api.put('/pt-app/off', { date: day, off: !isOff })
      toast(isOff ? 'Đã bỏ báo OFF' : 'Đã báo OFF ngày này')
      await off.reload()
    } catch (e) {
      toast(apiError(e).message, true)
    }
  }
  const { busy, complete } = useComplete(async () => { await sess.reload(); await d.month.reload() })
  const groups = groupSessions(sess.rows.filter((s) => dayOf(s.start_at) === day))
  const countOf = (iso: string) => sess.rows.filter((s) => dayOf(s.start_at) === iso && s.status !== 'cancelled').length
  const clsDays = [...new Set(cls.rows.map((c) => dayOf(c.start_at)))]
  const [openCls, setOpenCls] = useState('')

  return (
    <Page title="Lịch tập">
      <Chips items={[{ key: 'pt', label: 'PT 1:1 và 1:2' }, { key: 'class', label: 'Lớp nhóm' }]} value={seg} onChange={setSeg} />
      <div className="pta-weekbar">
        <button type="button" className="pta-ib" aria-label="Tuần trước" onClick={() => setDay(addDay(week, -7))}><Ico n="back" size={18} /></button>
        <span>{fmtDate(week)} – {fmtDate(addDay(week, 6))}</span>
        <button type="button" className="pta-ib" aria-label="Tuần sau" onClick={() => setDay(addDay(week, 7))}><Ico n="next" size={18} /></button>
      </div>

      {seg === 'pt' && (
        <>
          <div className="pta-strip">
            {days.map((iso) => (
              <button key={iso} type="button" className={`${day === iso ? 'on' : ''} ${iso === today ? 'today' : ''}`} aria-pressed={day === iso} onClick={() => setDay(iso)}>
                <small>{dow(iso)}</small><b>{iso.slice(8)}/{iso.slice(5, 7)}</b>{off.rows.includes(iso) ? <em>OFF</em> : countOf(iso) > 0 && <i>{countOf(iso)}</i>}
              </button>
            ))}
          </div>
          <button type="button" className={`pta-off ${isOff ? 'on' : ''}`} disabled={day < today} onClick={toggleOff}>{isOff ? 'Đang báo OFF - bấm để bỏ' : 'Báo OFF ngày này'}</button>
          {sess.err && <p className="pta-err">{sess.err}</p>}
          {!sess.loading && groups.length === 0 && <Empty text="Không có buổi dạy trong ngày này." />}
          {groups.map((g) => <SessionCard key={g[0].id} g={g} today={today} busy={busy} onDone={complete} onSaved={() => void sess.reload()} />)}
        </>
      )}

      {seg === 'class' && (
        <>
          {cls.err && <p className="pta-err">{cls.err}</p>}
          {!cls.loading && cls.rows.length === 0 && <Empty text="Tuần này chưa có lớp nhóm." />}
          {clsDays.map((iso) => (
            <section key={iso}>
              <h3 className="pta-h">{dayLabel(iso)}</h3>
              <table className="pta-tbl">
                <thead><tr><th>Giờ</th><th>PT</th><th>Học viên</th></tr></thead>
                <tbody>
                  {cls.rows.filter((c) => dayOf(c.start_at) === iso).map((c) => (
                    <Fragment key={c.id}>
                    <tr className={`${c.mine ? 'pta-mine pta-tap' : ''} ${c.status === 'cancelled' ? 'pta-offrow' : ''}`} onClick={c.mine ? () => setOpenCls(openCls === c.id ? '' : c.id) : undefined}>
                      <td>{fmtTime(c.start_at)}</td>
                      <td>{c.trainer ? givenName(c.trainer.name) : '-'}</td>
                      <td>
                        <b className={c.registered >= c.capacity ? 'pta-redtx' : ''}>{c.registered}/{c.capacity}</b>
                        {c.registrations.length > 0 && <span> {c.registrations.map((r) => givenName(r.name)).join(', ')}</span>}
                        {c.status === 'cancelled' && <span> (hủy)</span>}
                        {c.status === 'completed' && <span> (xong)</span>}
                      </td>
                    </tr>
                    {c.mine && openCls === c.id && <tr className="pta-mine"><td colSpan={3}><ClassAttend c={c} today={today} onChanged={() => void cls.reload()} /></td></tr>}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </>
      )}
    </Page>
  )
}

function BookForm({ c, others, onDone, onClose }: { c: Ctr; others: Ctr[]; onDone: () => void; onClose: () => void }) {
  const toast = useToast()
  const [date, setDate] = useState(addDay(localDay(), 1))
  const [time, setTime] = useState('18:00')
  const [dur, setDur] = useState('60')
  const [busy, setBusy] = useState(false)
  const pair = c.category === 'pt_1on2'
  const partners = others.filter((o) => o.id !== c.id && o.category === 'pt_1on2' && o.status === 'active' && (o.sessions_left ?? 0) > 0)
  const [partner, setPartner] = useState('')
  const book = async () => {
    setBusy(true)
    try {
      await api.post('/pt-app/sessions', { contract_id: c.id, ...(pair ? { partner_contract_id: partner } : {}), start_at: new Date(`${date}T${time}:00`).toISOString(), duration_min: Number(dur) })
      toast('Đã đặt lịch')
      onDone()
    } catch (e) {
      toast(apiError(e).message, true)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="pta-card pta-form">
      <header className="pta-cardhead"><b>Đặt lịch {pair ? 'PT 1:2' : 'PT 1:1'} cho {givenName(c.member.name)}</b></header>
      {pair && (
        <label>Khách thứ 2 (gói PT 1:2 của bạn)
          <select className="pta-select" value={partner} onChange={(e) => setPartner(e.target.value)}>
            <option value="">{partners.length ? 'Chọn khách thứ 2' : 'Chưa có khách PT 1:2 khác còn buổi'}</option>
            {partners.map((o) => <option key={o.id} value={o.id}>{o.member.name}, còn {o.sessions_left} buổi</option>)}
          </select>
        </label>
      )}
      <label>Ngày<input className="pta-select" type="date" min={localDay()} value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <label>Giờ bắt đầu<input className="pta-select" type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} /></label>
      <label>Thời lượng
        <select className="pta-select" value={dur} onChange={(e) => setDur(e.target.value)}>
          <option value="45">45 phút</option>
          <option value="60">60 phút</option>
          <option value="90">90 phút</option>
        </select>
      </label>
      <div className="pta-actions">
        <button type="button" className="pta-cta dark" onClick={onClose}>Đóng</button>
        <button type="button" className="pta-cta" disabled={busy || !date || !time || (pair && !partner)} onClick={book}>Đặt lịch</button>
      </div>
    </section>
  )
}

function ClientDetail({ c, d, onBack }: { c: Ctr; d: Shared; onBack: () => void }) {
  const [tab, setTab] = useState<'info' | 'sched'>('info')
  const [booking, setBooking] = useState(false)
  const st = CONTRACT_STATUS[c.status] ?? CONTRACT_STATUS.draft
  const debt = c.total_amount - c.paid_amount
  const mine = d.month.rows.filter((s) => s.member?.id === c.member.id)
  const upcoming = mine.filter((s) => s.status === 'scheduled' && new Date(s.end_at).getTime() >= Date.now())
  const history = mine.filter((s) => s.status === 'completed').reverse()
  const phone = c.member.phone.replace(/\D/g, '')
  return (
    <Page title="Chi tiết khách hàng" onBack={onBack}>
      <section className="pta-profile">
        <Avatar name={c.member.name} />
        <div>
          <h2>{c.member.name}</h2>
          <Pill tone={st.tone}>{st.label}</Pill>
        </div>
      </section>
      <Chips items={[{ key: 'info', label: 'Thông tin' }, { key: 'sched', label: 'Lịch tập' }]} value={tab} onChange={setTab} />
      {tab === 'info' && (
        <>
          <section className="pta-card pta-kv">
            <div><span>SĐT</span><b>{tel(c.member.phone)}</b></div>
            <div><span>Mã hội viên</span><b>{c.member.code}</b></div>
            <div><span>Ngày bắt đầu</span><b>{fmtDate(c.start_date)}</b></div>
            <div><span>Gói tập</span><b>{c.package_name} ({CAT[c.category] ?? c.category})</b></div>
            <div><span>Số buổi</span><b>{c.sessions_total == null ? '-' : `còn ${c.sessions_left ?? 0}/${c.sessions_total}`}</b></div>
            <div><span>Hạn sử dụng</span><b>{fmtDate(c.end_date)}</b></div>
            <div><span>Hợp đồng</span><b>{c.code}</b></div>
            <div><span>Lần tập gần nhất</span><b className={c.off_track ? 'pta-redtx' : ''}>{c.last_active ? fmtDate(dayOf(c.last_active)) : 'Chưa có'}{c.off_track ? ' (off track)' : ''}</b></div>
            {debt > 0 && <div><span>Còn nợ</span><b className="pta-redtx">{fmtMoney(debt)}</b></div>}
          </section>
        </>
      )}
      {tab === 'sched' && (
        <section className="pta-card">
          <header className="pta-cardhead"><b>Lịch sắp tới</b></header>
          {upcoming.length === 0 && <Empty text="Chưa có buổi hẹn sắp tới." />}
          {upcoming.map((s) => <div key={s.id} className="pta-row"><div className="pta-grow"><b>{dayLabel(dayOf(s.start_at))}</b><div className="pta-sub">{fmtTime(s.start_at)} – {fmtTime(s.end_at)} · {s.kind === 'pt_1on2' ? 'PT 1:2' : 'PT 1:1'}</div></div></div>)}
          <header className="pta-cardhead"><b>Đã tập gần đây</b></header>
          {history.length === 0 && <Empty text="Chưa có buổi hoàn thành trong tháng." />}
          {history.slice(0, 8).map((s) => <div key={s.id} className="pta-row"><div className="pta-grow"><b>{fmtDate(dayOf(s.start_at))}</b><div className="pta-sub">{fmtTime(s.start_at)} – {fmtTime(s.end_at)}</div></div><Pill tone="ok">Đã hoàn thành</Pill></div>)}
        </section>
      )}
      {booking && <BookForm c={c} others={d.contracts.rows} onClose={() => setBooking(false)} onDone={() => { setBooking(false); void d.month.reload() }} />}
      {c.status === 'active' && (c.sessions_left ?? 0) > 0 && !booking && c.category !== 'pt_group' && <button type="button" className="pta-cta wide" onClick={() => setBooking(true)}>Đặt lịch buổi tập</button>}
      <div className="pta-actions">
        <a className="pta-cta dark" href={`https://zalo.me/${phone}`} target="_blank" rel="noreferrer"><Ico n="chat" size={18} /> Nhắn Zalo</a>
        <a className="pta-cta" href={`tel:${c.member.phone}`}><Ico n="phone" size={18} /> Gọi điện</a>
      </div>
    </Page>
  )
}

function Clients({ d, preset }: { d: Shared; preset: Sub }) {
  const [f, setF] = useState<'all' | 'active' | 'frozen' | 'expired' | 'off'>(preset === 'off' ? 'off' : 'all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Ctr | null>(null)
  const rows = d.contracts.rows
  const count = (s: string) => rows.filter((c) => c.status === s).length
  const shown = rows.filter((c) => (f === 'all' || (f === 'off' ? c.off_track : c.status === f)) && (!q || c.member.name.toLowerCase().includes(q.toLowerCase()) || c.member.phone.includes(q)))
  if (open) return <ClientDetail c={open} d={d} onBack={() => setOpen(null)} />
  return (
    <Page title="Khách hàng">
      <input className="pta-search" type="search" placeholder="Tìm tên hoặc số điện thoại" value={q} onChange={(e) => setQ(e.target.value)} />
      <Chips
        items={[{ key: 'all', label: `Tất cả (${rows.length})` }, { key: 'active', label: `Đang tập (${count('active')})` }, { key: 'frozen', label: `Tạm ngưng (${count('frozen')})` }, { key: 'expired', label: `Hết hạn (${count('expired')})` }, { key: 'off', label: `Off track (${rows.filter((c) => c.off_track).length})` }]}
        value={f}
        onChange={setF}
      />
      {d.contracts.err && <p className="pta-err">{d.contracts.err}</p>}
      {!d.contracts.loading && shown.length === 0 && <Empty text="Không có khách hàng." />}
      <section className="pta-list">
        {shown.map((c) => {
          const st = CONTRACT_STATUS[c.status] ?? CONTRACT_STATUS.draft
          return (
            <button key={c.id} type="button" className="pta-item" onClick={() => setOpen(c)}>
              <Avatar name={c.member.name} />
              <div className="pta-grow">
                <div className="pta-name">{c.member.name}</div>
                <div className="pta-sub">{c.sessions_total == null ? c.package_name : `Còn ${c.sessions_left ?? 0}/${c.sessions_total} buổi`} · {CAT[c.category] ?? ''}</div>
                {c.off_track && <div className="pta-sub pta-redtx">{c.last_active ? `${Math.floor((Date.now() - new Date(c.last_active).getTime()) / 86400000)} ngày chưa tập` : 'Chưa tập lần nào'}</div>}
              </div>
              <Pill tone={st.tone}>{st.label}</Pill>
              <Ico n="next" size={16} />
            </button>
          )
        })}
      </section>
    </Page>
  )
}

function Leads({ d }: { d: Shared }) {
  const toast = useToast()
  const [f, setF] = useState<'new' | 'talk' | 'won'>('new')
  const [edit, setEdit] = useState<{ id: string; status: string; note: string } | null>(null)
  const rows = d.leads.rows
  const grp = (k: string) => (k === 'new' ? rows.filter((l) => l.status === 'new') : k === 'talk' ? rows.filter((l) => ['contacted', 'trial_booked'].includes(l.status)) : rows.filter((l) => l.status === 'converted'))
  const shown = grp(f)
  const save = async () => {
    if (!edit) return
    try {
      await api.patch(`/pt-app/leads/${edit.id}`, { status: edit.status, note: edit.note || null })
      toast('Đã cập nhật lead')
      setEdit(null)
      await d.leads.reload()
    } catch (e) {
      toast(apiError(e).message, true)
    }
  }
  return (
    <Page title="Giao lead MKT">
      <Chips items={[{ key: 'new', label: `Lead mới (${grp('new').length})` }, { key: 'talk', label: `Đã tư vấn (${grp('talk').length})` }, { key: 'won', label: `Đã chốt (${grp('won').length})` }]} value={f} onChange={setF} />
      {d.leads.err && <p className="pta-err">{d.leads.err}</p>}
      {!d.leads.loading && shown.length === 0 && <Empty text="Không có lead." />}
      <section className="pta-list">
        {shown.map((l) => (
          <div key={l.id} className="pta-leadwrap">
            <div className="pta-item">
              <Avatar name={l.name} />
              <div className="pta-grow">
                <div className="pta-name">{l.name}</div>
                <div className="pta-sub">{tel(l.phone)}{l.source ? ` · ${l.source}` : ''}</div>
                {l.interest && <div className="pta-sub">Quan tâm: {l.interest}</div>}
                {l.note && <div className="pta-sub">Ghi chú: {l.note}</div>}
              </div>
              {l.status === 'new' ? <Pill tone="warn">Mới</Pill> : <Pill tone={l.status === 'converted' ? 'ok' : l.status === 'lost' ? 'bad' : 'info'}>{LEAD_STATUS[l.status]}</Pill>}
            </div>
            {l.status !== 'converted' && edit?.id !== l.id && <button type="button" className="pta-link" onClick={() => setEdit({ id: l.id, status: l.status, note: l.note ?? '' })}>Cập nhật kết quả</button>}
            {edit?.id === l.id && (
              <div className="pta-edit">
                <select className="pta-select" aria-label="Trạng thái lead" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                  {['new', 'contacted', 'trial_booked', 'lost'].map((s) => <option key={s} value={s}>{LEAD_STATUS[s]}</option>)}
                </select>
                <textarea className="pta-select" aria-label="Ghi chú" rows={3} placeholder="Ghi chú" value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
                <div className="pta-actions">
                  <button type="button" className="pta-cta dark" onClick={() => setEdit(null)}>Đóng</button>
                  <button type="button" className="pta-cta" onClick={save}>Lưu</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </section>
    </Page>
  )
}

interface Perf { month: string; sessions_done: number; classes_done: number; leads_assigned: number; leads_converted: number; conversion_rate: number | null; clients: number; renewals: number; renew_rate: number | null }

interface Rev { month: string; member: number; pt: number; group: number; total: number; kpi: { target: number; achieved: number; pct: number | null } }

function Targets() {
  const [p, setP] = useState<Perf | null>(null)
  const [rev, setRev] = useState<Rev | null>(null)
  useEffect(() => {
    api.get('/pt-app/performance').then(({ data }) => setP(data.data)).catch(() => setP(null))
    api.get('/pt-app/revenue').then(({ data }) => setRev(data.data)).catch(() => setRev(null))
  }, [])
  if (!p) return null
  const pct = (v: number | null) => (v == null ? '-' : `${v}%`)
  return (
    <section className="pta-card">
      <header className="pta-cardhead"><b>Chỉ tiêu tháng {p.month.slice(5)}/{p.month.slice(0, 4)}</b></header>
      {rev && (
        <>
          <div className="pta-kv">
            <div><span>Doanh thu gói PT</span><b>{fmtMoney(rev.pt)}</b></div>
            <div><span>Doanh thu gói member</span><b>{fmtMoney(rev.member)}</b></div>
            <div><span>Doanh thu lớp nhóm</span><b>{fmtMoney(rev.group)}</b></div>
            <div><span>Tổng thực thu</span><b>{fmtMoney(rev.total)}</b></div>
          </div>
          {rev.kpi.target > 0 ? (
            <div className="pta-kpi">
              <div className="pta-kpihead"><span>KPI bán gói PT</span><b>{fmtMoney(rev.kpi.achieved)} / {fmtMoney(rev.kpi.target)} ({pct(rev.kpi.pct)})</b></div>
              <div className="pta-prog"><i style={{ width: `${Math.min(100, rev.kpi.pct ?? 0)}%` }} /></div>
            </div>
          ) : (
            <p className="pta-sub">Chưa đặt chỉ tiêu bán gói PT cho tháng này.</p>
          )}
          <p className="pta-sub">Doanh thu = tiền thực thu từ hợp đồng do bạn bán, đã trừ hoàn tiền.</p>
        </>
      )}
      <div className="pta-kv">
        <div><span>Buổi PT đã dạy</span><b>{p.sessions_done}</b></div>
        <div><span>Lớp nhóm đã dạy</span><b>{p.classes_done}</b></div>
        <div><span>Tỉ lệ chốt lead</span><b>{pct(p.conversion_rate)} ({p.leads_converted}/{p.leads_assigned})</b></div>
        <div><span>Tỉ lệ gia hạn</span><b>{pct(p.renew_rate)} ({p.renewals}/{p.clients})</b></div>
      </div>
      <p className="pta-sub">Chốt lead = lead đã chốt / lead được chia trong tháng. Gia hạn = hợp đồng gia hạn / tổng khách PT.</p>
    </section>
  )
}

function Stats({ d, onBack }: { d: Shared; onBack: () => void }) {
  const [range, setRange] = useState<'week' | 'month'>('week')
  const today = localDay()
  const from = range === 'week' ? mondayOf(today) : monthStart(today)
  const to = range === 'week' ? addDay(from, 6) : localDay(new Date(new Date(`${from}T00:00:00`).getFullYear(), new Date(`${from}T00:00:00`).getMonth() + 1, 0))
  const cls = useLoad<Cls>('/pt-app/classes', { from, to })
  const inRange = d.month.rows.filter((s) => dayOf(s.start_at) >= from && dayOf(s.start_at) <= to)
  const done = inRange.filter((s) => s.status === 'completed').length
  const planned = inRange.filter((s) => s.status !== 'cancelled').length
  const myCls = cls.rows.filter((c) => c.mine && c.status !== 'cancelled').length
  const active = d.contracts.rows.filter((c) => c.status === 'active').length
  const bars = useMemo(() => {
    const days = range === 'week' ? Array.from({ length: 7 }, (_, i) => addDay(from, i)) : Array.from({ length: 4 }, (_, i) => addDay(from, i * 7))
    return days.map((iso, i) => {
      const end = range === 'week' ? iso : addDay(iso, 6)
      const part = inRange.filter((s) => dayOf(s.start_at) >= iso && dayOf(s.start_at) <= end && s.status !== 'cancelled')
      return { label: range === 'week' ? dow(iso) : `T${i + 1}`, total: part.length, done: part.filter((s) => s.status === 'completed').length }
    })
  }, [range, from, inRange])
  const max = Math.max(1, ...bars.map((b) => b.total))
  return (
    <Page title="Thống kê" onBack={onBack}>
      <Chips items={[{ key: 'week', label: 'Tuần này' }, { key: 'month', label: 'Tháng này' }]} value={range} onChange={setRange} />
      <div className="pta-kpis">
        <div><b>{done}</b><span>Buổi PT đã dạy</span></div>
        <div><b>{active}</b><span>Khách đang tập</span></div>
        <div><b>{myCls}</b><span>Lớp nhóm dạy</span></div>
      </div>
      <section className="pta-card">
        <header className="pta-cardhead"><b>Biểu đồ buổi dạy</b><span className="pta-sub">{done}/{planned} đã dạy</span></header>
        <div className="pta-bars">
          {bars.map((b) => (
            <div key={b.label}>
              <div className="pta-barcol">
                <i className="all" style={{ height: `${(b.total / max) * 100}%` }} />
                <i className="done" style={{ height: `${(b.done / max) * 100}%` }} />
              </div>
              <small>{b.label}</small>
            </div>
          ))}
        </div>
        <div className="pta-legend"><span><i className="done" />Đã dạy</span><span><i className="all" />Tổng lịch</span></div>
      </section>
      <Targets />
    </Page>
  )
}

interface InstallEvent extends Event { prompt: () => Promise<void> }

function useInstall() {
  const [ev, setEv] = useState<InstallEvent | null>(null)
  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setEv(e as InstallEvent) }
    window.addEventListener('beforeinstallprompt', on)
    return () => window.removeEventListener('beforeinstallprompt', on)
  }, [])
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  return { ev, standalone, ios }
}

function Settings() {
  const { user, logout } = useAuth()
  const inst = useInstall()
  return (
    <Page title="Cài đặt">
      <section className="pta-profile">
        <Avatar name={user?.name ?? '?'} />
        <div>
          <h2>{user?.name}</h2>
          <div className="pta-sub">{user?.email}</div>
          <div className="pta-sub">{user?.branches.map((b) => b.name).join(', ')}</div>
        </div>
      </section>
      {!inst.standalone && (
        <section className="pta-card">
          <header className="pta-cardhead"><b>Cài về điện thoại</b></header>
          {inst.ev ? (
            <button type="button" className="pta-cta" onClick={() => void inst.ev!.prompt()}>Cài ứng dụng</button>
          ) : inst.ios ? (
            <p className="pta-sub">Mở bằng Safari, bấm nút Chia sẻ rồi chọn "Thêm vào Màn hình chính".</p>
          ) : (
            <p className="pta-sub">Mở menu trình duyệt (dấu ba chấm) rồi chọn "Cài đặt ứng dụng" hoặc "Thêm vào màn hình chính".</p>
          )}
        </section>
      )}
      <section className="pta-list">
        <Link className="pta-item" to="/me"><div className="pta-grow pta-name">Đổi mật khẩu và phiên đăng nhập</div><Ico n="next" size={16} /></Link>
        <button type="button" className="pta-item pta-logout" onClick={() => void logout()}><div className="pta-grow pta-name">Đăng xuất</div></button>
      </section>
    </Page>
  )
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'home', label: 'Trang chủ' },
  { key: 'schedule', label: 'Lịch tập' },
  { key: 'clients', label: 'Khách hàng' },
  { key: 'leads', label: 'Lead' },
  { key: 'settings', label: 'Cài đặt' },
]

export default function PtApp() {
  const { user, ready } = useAuth()
  const [tab, setTab] = useState<Tab>('home')
  const [sub, setSub] = useState<Sub>(null)
  const today = localDay()
  const month = useLoad<Sess>('/pt-app/schedule', { from: monthStart(today), to: addDay(today, 30) })
  const contracts = useLoad<Ctr>('/pt-app/contracts')
  const leads = useLoad<LeadRow>('/pt-app/leads')
  if (!ready) return <div className="loading">Đang tải...</div>
  if (!user) return <Navigate to="/login" replace state={{ from: '/pt-app' }} />
  if (!user.roles.includes('trainer')) return <Navigate to="/" replace />
  const d: Shared = { month, contracts, leads }
  const go = (t: Tab, s: Sub = null) => { setTab(t); setSub(s) }
  const newLeads = leads.rows.filter((l) => l.status === 'new').length
  return (
    <div className="pta">
      <main className="pta-main">
        {tab === 'home' && (sub === 'stats' ? <Stats d={d} onBack={() => setSub(null)} /> : <Home d={d} go={go} name={user.name} />)}
        {tab === 'schedule' && <Schedule d={d} />}
        {tab === 'clients' && <Clients key={sub ?? 'all'} d={d} preset={sub} />}
        {tab === 'leads' && <Leads d={d} />}
        {tab === 'settings' && <Settings />}
      </main>
      <nav className="pta-tabs" aria-label="Điều hướng PT">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={tab === t.key ? 'on' : ''} aria-current={tab === t.key ? 'page' : undefined} onClick={() => go(t.key)}>
            <Ico n={t.key} size={22} />
            <span>{t.label}</span>
            {t.key === 'leads' && newLeads > 0 && <i className="pta-dot">{newLeads}</i>}
          </button>
        ))}
      </nav>
    </div>
  )
}
