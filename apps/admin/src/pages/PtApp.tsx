import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDate, fmtMoney, fmtTime } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { Button, Chip, EmptyState, Select, Textarea } from '../components/ui'
import './ptApp.css'

type Tab = 'schedule' | 'classes' | 'clients' | 'leads'
const TABS: { key: Tab; label: string }[] = [
  { key: 'schedule', label: 'Lịch dạy' },
  { key: 'classes', label: 'Lớp nhóm' },
  { key: 'clients', label: 'Khách hàng' },
  { key: 'leads', label: 'Lead' },
]

interface Person { id: string; code: string; name: string; phone: string }
interface Sess { id: string; start_at: string; end_at: string; status: string; note: string | null; kind: 'pt_1on1' | 'pt_1on2'; member: Person | null; contract_code: string | null; sessions_left: number | null }
interface Cls { id: string; title: string | null; muscle_group: string | null; trainer: { id: string; name: string }; mine: boolean; start_at: string; end_at: string; capacity: number; status: string; registered: number; registrations: { id: string; name: string; phone: string; status: string }[] }
interface Ctr { id: string; code: string; status: string; member: Person; package_name: string; category: string; sessions_total: number | null; sessions_left: number | null; start_date: string | null; end_date: string | null; total_amount: number; paid_amount: number }
interface LeadRow { id: string; name: string; phone: string; source: string | null; interest: string | null; status: string; note: string | null; created_at: string }

const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDay = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return localDay(d)
}
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })
const dayOf = (iso: string) => localDay(new Date(iso))
const tel = (p: string) => (
  <a className="pta-tel" href={`tel:${p}`}>{p}</a>
)

const SESSION_STATUS: Record<string, { tone: 'ok' | 'warn' | 'bad' | 'neutral'; label: string }> = {
  scheduled: { tone: 'neutral', label: 'Sắp dạy' },
  completed: { tone: 'ok', label: 'Đã dạy' },
  cancelled: { tone: 'bad', label: 'Đã hủy' },
  no_show: { tone: 'warn', label: 'Vắng' },
}
const CONTRACT_STATUS: Record<string, { tone: 'ok' | 'warn' | 'bad' | 'neutral'; label: string }> = {
  active: { tone: 'ok', label: 'Đang hiệu lực' },
  expired: { tone: 'bad', label: 'Hết hạn' },
  frozen: { tone: 'warn', label: 'Bảo lưu' },
  signed: { tone: 'warn', label: 'Chưa kích hoạt' },
  draft: { tone: 'neutral', label: 'Nháp' },
  cancelled: { tone: 'bad', label: 'Đã hủy' },
}
const CAT: Record<string, string> = { pt_1on1: 'PT 1:1', pt_1on2: 'PT 1:2', pt_group: 'PT nhóm' }
const LEAD_STATUS: Record<string, string> = { new: 'Mới', contacted: 'Đã liên hệ', trial_booked: 'Hẹn tập thử', converted: 'Đã chốt', lost: 'Không chốt' }

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

function Status({ err, loading, empty, children }: { err: string; loading: boolean; empty: boolean; children: React.ReactNode }) {
  if (err) return <p className="pta-err">{err}</p>
  if (loading && empty) return <p className="pta-note">Đang tải...</p>
  if (empty) return <EmptyState title="Chưa có dữ liệu" />
  return <>{children}</>
}

function Schedule() {
  const toast = useToast()
  const [day, setDay] = useState(localDay())
  const { rows, err, loading, reload } = useLoad<Sess>('/pt-app/schedule', { from: day, to: day })
  const [busy, setBusy] = useState('')

  const complete = async (s: Sess) => {
    setBusy(s.id)
    try {
      await api.post(`/pt/sessions/${s.id}/complete`, {})
      toast('Đã xác nhận buổi dạy')
      await reload()
    } catch (e) {
      toast(apiError(e).message, true)
    } finally {
      setBusy('')
    }
  }

  const groups: { key: string; items: Sess[] }[] = []
  for (const s of rows) {
    const g = groups.find((x) => x.key === s.start_at && x.items[0].kind === 'pt_1on2' && s.kind === 'pt_1on2')
    if (g) g.items.push(s)
    else groups.push({ key: s.start_at, items: [s] })
  }

  return (
    <>
      <div className="pta-daybar">
        <button type="button" aria-label="Ngày trước" onClick={() => setDay(addDay(day, -1))}>‹</button>
        <button type="button" className="pta-day" onClick={() => setDay(localDay())}>{dayLabel(day)}{day === localDay() ? ' (hôm nay)' : ''}</button>
        <button type="button" aria-label="Ngày sau" onClick={() => setDay(addDay(day, 1))}>›</button>
      </div>
      <Status err={err} loading={loading} empty={groups.length === 0}>
        {groups.map((g) => {
          const first = g.items[0]
          const st = SESSION_STATUS[first.status] ?? SESSION_STATUS.scheduled
          const canDone = day <= localDay() && g.items.some((s) => s.status === 'scheduled' && s.member)
          return (
            <article key={first.id} className="pta-card">
              <header>
                <strong>{fmtTime(first.start_at)} - {fmtTime(first.end_at)}</strong>
                <span><Chip tone="neutral">{first.kind === 'pt_1on2' ? '1:2' : '1:1'}</Chip> <Chip tone={st.tone}>{st.label}</Chip></span>
              </header>
              {g.items.map((s) => (
                <div key={s.id} className="pta-line">
                  <div>
                    <div className="pta-name">{s.member?.name ?? 'Chưa gán khách'}</div>
                    {s.member && <div className="pta-sub">{tel(s.member.phone)} · còn {s.sessions_left ?? '-'} buổi</div>}
                  </div>
                  {s.status === 'scheduled' && s.member && day <= localDay() && (
                    <Button variant="primary" small disabled={busy === s.id} onClick={() => complete(s)}>Đã dạy</Button>
                  )}
                </div>
              ))}
              {!canDone && first.status === 'scheduled' && day > localDay() && <p className="pta-note">Chỉ xác nhận được buổi trong ngày.</p>}
            </article>
          )
        })}
      </Status>
    </>
  )
}

function Classes() {
  const [day, setDay] = useState(localDay())
  const { rows, err, loading } = useLoad<Cls>('/pt-app/classes', { from: day, to: addDay(day, 6) })
  const [open, setOpen] = useState('')
  const days = [...new Set(rows.map((c) => dayOf(c.start_at)))]
  return (
    <>
      <div className="pta-daybar">
        <button type="button" aria-label="Tuần trước" onClick={() => setDay(addDay(day, -7))}>‹</button>
        <button type="button" className="pta-day" onClick={() => setDay(localDay())}>7 ngày từ {fmtDate(day)}</button>
        <button type="button" aria-label="Tuần sau" onClick={() => setDay(addDay(day, 7))}>›</button>
      </div>
      <Status err={err} loading={loading} empty={rows.length === 0}>
        {days.map((d) => (
          <section key={d}>
            <h3 className="pta-h">{dayLabel(d)}</h3>
            {rows.filter((c) => dayOf(c.start_at) === d).map((c) => (
              <article key={c.id} className={`pta-card ${c.mine ? 'pta-mine' : ''}`}>
                <header>
                  <strong>{fmtTime(c.start_at)} - {fmtTime(c.end_at)}</strong>
                  <Chip tone={c.registered >= c.capacity ? 'bad' : 'ok'}>{c.registered}/{c.capacity}</Chip>
                </header>
                <div className="pta-name">{c.title || c.muscle_group || 'Lớp nhóm'}</div>
                <div className="pta-sub">PT: {c.trainer.name}{c.mine ? ' (bạn)' : ''}{c.status === 'cancelled' ? ' · Đã hủy' : ''}</div>
                {c.registrations.length > 0 && (
                  <button type="button" className="pta-link" onClick={() => setOpen(open === c.id ? '' : c.id)}>
                    {open === c.id ? 'Ẩn danh sách' : `Xem ${c.registrations.length} học viên`}
                  </button>
                )}
                {open === c.id && (
                  <ul className="pta-list">
                    {c.registrations.map((r) => <li key={r.id}>{r.name} {tel(r.phone)}</li>)}
                  </ul>
                )}
              </article>
            ))}
          </section>
        ))}
      </Status>
    </>
  )
}

function Clients() {
  const [status, setStatus] = useState('active')
  const [q, setQ] = useState('')
  const { rows, err, loading } = useLoad<Ctr>('/pt-app/contracts', { status, ...(q ? { q } : {}) })
  return (
    <>
      <div className="pta-filters">
        <input className="pta-search" type="search" placeholder="Tìm tên hoặc số điện thoại" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="Trạng thái hợp đồng" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Đang hiệu lực</option>
          <option value="expired">Hết hạn</option>
          <option value="frozen">Bảo lưu</option>
          <option value="">Tất cả</option>
        </Select>
      </div>
      <Status err={err} loading={loading} empty={rows.length === 0}>
        {rows.map((c) => {
          const st = CONTRACT_STATUS[c.status] ?? CONTRACT_STATUS.draft
          const debt = c.total_amount - c.paid_amount
          return (
            <article key={c.id} className="pta-card">
              <header>
                <strong>{c.member.name}</strong>
                <Chip tone={st.tone}>{st.label}</Chip>
              </header>
              <div className="pta-sub">{tel(c.member.phone)} · {c.member.code}</div>
              <div className="pta-grid">
                <span>Gói</span><b>{c.package_name} ({CAT[c.category] ?? c.category})</b>
                <span>Số buổi</span><b>{c.sessions_total == null ? '-' : `còn ${c.sessions_left ?? 0}/${c.sessions_total}`}</b>
                <span>Thời hạn</span><b>{fmtDate(c.start_date)} - {fmtDate(c.end_date)}</b>
                <span>Hợp đồng</span><b>{c.code}</b>
                {debt > 0 && (<><span>Còn nợ</span><b className="pta-bad">{fmtMoney(debt)}</b></>)}
              </div>
            </article>
          )
        })}
      </Status>
    </>
  )
}

function Leads() {
  const toast = useToast()
  const { rows, err, loading, reload } = useLoad<LeadRow>('/pt-app/leads')
  const [edit, setEdit] = useState<{ id: string; status: string; note: string } | null>(null)
  const save = async () => {
    if (!edit) return
    try {
      await api.patch(`/pt-app/leads/${edit.id}`, { status: edit.status, note: edit.note || null })
      toast('Đã cập nhật lead')
      setEdit(null)
      await reload()
    } catch (e) {
      toast(apiError(e).message, true)
    }
  }
  return (
    <Status err={err} loading={loading} empty={rows.length === 0}>
      {rows.map((l) => (
        <article key={l.id} className="pta-card">
          <header>
            <strong>{l.name}</strong>
            <Chip tone={l.status === 'new' ? 'warn' : l.status === 'converted' ? 'ok' : l.status === 'lost' ? 'bad' : 'neutral'}>{LEAD_STATUS[l.status] ?? l.status}</Chip>
          </header>
          <div className="pta-sub">{tel(l.phone)}{l.source ? ` · ${l.source}` : ''} · {fmtDate(l.created_at)}</div>
          {l.interest && <div className="pta-sub">Quan tâm: {l.interest}</div>}
          {l.note && <div className="pta-sub">Ghi chú: {l.note}</div>}
          {edit?.id === l.id ? (
            <div className="pta-edit">
              <Select aria-label="Trạng thái lead" value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}>
                {['new', 'contacted', 'trial_booked', 'lost'].map((s) => <option key={s} value={s}>{LEAD_STATUS[s]}</option>)}
              </Select>
              <Textarea aria-label="Ghi chú" rows={3} value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
              <div className="pta-row">
                <Button variant="primary" onClick={save}>Lưu</Button>
                <Button onClick={() => setEdit(null)}>Đóng</Button>
              </div>
            </div>
          ) : (
            l.status !== 'converted' && <Button small onClick={() => setEdit({ id: l.id, status: l.status === 'converted' ? 'contacted' : l.status, note: l.note ?? '' })}>Cập nhật</Button>
          )}
        </article>
      ))}
    </Status>
  )
}

export const isTrainerOnly = (roles: string[]) => roles.includes('trainer') && !roles.some((r) => ['owner', 'super_admin', 'branch_manager', 'receptionist', 'admin'].includes(r))

export default function PtApp() {
  const { user, ready, logout } = useAuth()
  const [tab, setTab] = useState<Tab>('schedule')
  if (!ready) return <div className="loading">Đang tải...</div>
  if (!user) return <Navigate to="/login" replace state={{ from: '/pt-app' }} />
  if (!user.roles.includes('trainer')) return <Navigate to="/" replace />
  return (
    <div className="pta">
      <header className="pta-top">
        <div>
          <div className="pta-hello">Xin chào</div>
          <strong>{user.name}</strong>
        </div>
        <Button small onClick={() => void logout()}>Đăng xuất</Button>
      </header>
      <main className="pta-main">
        {tab === 'schedule' && <Schedule />}
        {tab === 'classes' && <Classes />}
        {tab === 'clients' && <Clients />}
        {tab === 'leads' && <Leads />}
      </main>
      <nav className="pta-tabs" aria-label="Điều hướng PT">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={tab === t.key ? 'on' : ''} aria-current={tab === t.key ? 'page' : undefined} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </nav>
    </div>
  )
}
