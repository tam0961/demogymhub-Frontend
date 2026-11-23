import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import poster from '../assets/lich-lop.png'
import './publicBooking.css'

interface Session { id: string; date: string; start: string; end: string; muscle_group: string | null; capacity: number; left: number }
interface Listing { branch: { code: string; name: string }; sessions: Session[]; max_pick: number; week: { from: string; to: string }; now: string }
interface Booked { class_id: string; date: string; start: string; end: string; muscle_group: string | null }
type Lookup = { state: 'idle' } | { state: 'wait' } | { state: 'found'; name: string; email: string | null } | { state: 'none' } | { state: 'error'; text: string }

const DEFAULT_SLOTS = ['06:30-07:45', '20:00-21:15']
const DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const dowOf = (iso: string) => new Date(`${iso}T12:00:00`).getDay()
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const hLabel = (t: string) => {
  const [h, m] = t.split(':')
  return `${Number(h)}h${m === '00' ? '' : m}`
}
const slotLabel = (key: string) => key.split('-').map(hLabel).join('-')
const addDays = (iso: string, n: number) => new Date(new Date(`${iso}T12:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10)

const ERR_TEXT: Record<string, string> = {
  NO_MEMBER: 'Số điện thoại chưa có thông tin hội viên.',
  RATE: 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.',
  DUPLICATE: 'Lượt đăng ký này vừa được gửi, vui lòng chờ một lát.',
  MEMBER_PACKAGE_EXPIRED: 'Gói hội viên của bạn đã hết hạn.',
  TOO_MANY: 'Chỉ chọn tối đa 5 buổi mỗi lần.',
  WEEK_LIMIT: 'Mỗi tuần chỉ đăng ký tối đa 5 buổi (đã tính các buổi bạn đặt trước đó).',
  MIXED_WEEK: 'Các buổi chọn phải nằm trong cùng một tuần.',
}
const REASON_TEXT: Record<string, string> = { full: 'đã đầy', closed: 'đã đóng đăng ký', duplicate: 'bạn đã đăng ký rồi', no_sessions: 'bạn đã hết buổi PT nhóm' }

export default function PublicBooking() {
  const [params] = useSearchParams()
  const branch = params.get('branch') ?? 'q7'
  const [data, setData] = useState<Listing | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [phone, setPhone] = useState(() => { try { return localStorage.getItem('pb_phone') ?? '' } catch { return '' } })
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' })
  const [picked, setPicked] = useState<string[]>([])
  const [shake, setShake] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [zoom, setZoom] = useState(false)
  const [done, setDone] = useState<{ name: string; booked: Booked[] } | null>(null)
  const loadedAt = useRef(Date.now())

  const load = useCallback(async () => {
    try {
      const { data: r } = await api.get<{ data: Listing }>('/public/classes', { params: { branch } })
      setData(r.data)
      loadedAt.current = Date.now()
      setLoadErr('')
    } catch {
      setLoadErr('Không tải được lịch lớp. Vui lòng thử lại.')
    }
  }, [branch])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'visible' && Date.now() - loadedAt.current > 5 * 60000) load() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [load])

  useEffect(() => {
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 9) { setLookup({ state: 'idle' }); return }
    setLookup({ state: 'wait' })
    const t = setTimeout(async () => {
      try {
        const { data: r } = await api.get<{ data: { found: boolean; name?: string; email?: string | null } }>('/public/member', { params: { phone } })
        setLookup(r.data.found ? { state: 'found', name: r.data.name ?? '', email: r.data.email ?? null } : { state: 'none' })
        try { localStorage.setItem('pb_phone', phone) } catch { /* ignore */ }
      } catch (e) {
        const status = (e as { response?: { status?: number } }).response?.status
        setLookup({ state: 'error', text: status === 429 ? 'Hệ thống đang quá tải, thử lại sau ít phút.' : 'Không tra cứu được, thử lại.' })
      }
    }, 450)
    return () => clearTimeout(t)
  }, [phone])

  const slots = useMemo(() => {
    const keys = new Set(DEFAULT_SLOTS)
    for (const s of data?.sessions ?? []) keys.add(`${s.start}-${s.end}`)
    return [...keys].sort()
  }, [data])
  const days = useMemo(() => {
    if (!data) return []
    const all = Array.from({ length: 7 }, (_, i) => addDays(data.week.from, i))
    return all.filter((d) => dowOf(d) !== 0 || data.sessions.some((s) => s.date === d))
  }, [data])
  const cell = useMemo(() => new Map((data?.sessions ?? []).map((s) => [`${s.date}|${s.start}-${s.end}`, s])), [data])
  const today = data ? new Date(new Date(data.now).getTime() + 7 * 3600000).toISOString().slice(0, 10) : ''
  const max = data?.max_pick ?? 5

  const toggle = (s: Session) => {
    if (s.left <= 0) return
    setMsg('')
    setPicked((p) => {
      if (p.includes(s.id)) return p.filter((x) => x !== s.id)
      if (p.length >= max) {
        setShake(s.id)
        setMsg(`Mỗi tuần chỉ đăng ký tối đa ${max} buổi.`)
        setTimeout(() => setShake(''), 400)
        return p
      }
      return [...p, s.id]
    })
  }

  const submit = async () => {
    if (lookup.state !== 'found') { setMsg('Nhập số điện thoại hội viên trước khi đăng ký.'); return }
    setBusy(true)
    setMsg('')
    try {
      const { data: r } = await api.post<{ data: { name: string; booked: Booked[] } }>('/public/book', { phone, class_ids: picked, website: '' })
      setDone(r.data)
      setPicked([])
      load()
    } catch (e) {
      const body = (e as { response?: { data?: { error?: { code?: string; failed?: { class_id: string; reason: string }[] } } } }).response?.data?.error
      if (body?.code === 'CONFLICT' && body.failed) {
        const lines = body.failed.map((f) => {
          const s = data?.sessions.find((x) => x.id === f.class_id)
          return `${s ? `${DOW[dowOf(s.date)]} ${dm(s.date)} ${hLabel(s.start)}` : 'Một buổi'} ${REASON_TEXT[f.reason] ?? 'không đăng ký được'}`
        })
        setMsg(`Chưa đăng ký buổi nào. ${lines.join('; ')}. Vui lòng chọn lại.`)
        setPicked((p) => p.filter((id) => !body.failed!.some((f) => f.class_id === id)))
        load()
      } else setMsg((body?.code && ERR_TEXT[body.code]) || 'Không đăng ký được, vui lòng thử lại.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="pb">
        <Header />
        <main className="pb-main">
          <div className="pb-ticket" role="status">
            <div className="pb-tick" aria-hidden="true">✓</div>
            <h2>Đã đặt {done.booked.length} buổi</h2>
            <p className="pb-muted">{done.name}</p>
            <ul>
              {done.booked.map((b) => (
                <li key={b.class_id}><b>{DOW[dowOf(b.date)]} {dm(b.date)}</b> · {b.start}-{b.end}{b.muscle_group ? ` · ${b.muscle_group}` : ''}</li>
              ))}
            </ul>
            <button type="button" className="pb-btn" onClick={() => setDone(null)}>Đặt thêm buổi khác</button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="pb">
      <Header />
      <main className="pb-main">
        <button type="button" className="pb-poster" aria-label="Xem lịch lớp phóng to" onClick={() => setZoom(true)}>
          <img src={poster} alt="Lịch PT nhóm Nhập môn Gym: 6h30 đến 7h45 và 20h đến 21h15 từ Thứ 2 đến Thứ 7, Chủ nhật nghỉ" />
        </button>
        <section className="pb-card">
          <h2>Thông tin đăng ký</h2>
          <label htmlFor="pb-phone">Số điện thoại hội viên</label>
          <input id="pb-phone" className="pb-input" inputMode="tel" autoComplete="tel" placeholder="09xx xxx xxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <div className="pb-lookup" aria-live="polite">
            {lookup.state === 'wait' && <span className="pb-muted">Đang tra cứu...</span>}
            {lookup.state === 'none' && <span className="pb-bad">Chưa có thông tin hội viên</span>}
            {lookup.state === 'error' && <span className="pb-bad">{lookup.text}</span>}
          </div>
          <div className="pb-info">
            <div><span>Họ và tên</span><b>{lookup.state === 'found' ? lookup.name : '–'}</b></div>
            <div><span>Email</span><b>{lookup.state === 'found' ? lookup.email ?? '–' : '–'}</b></div>
          </div>
        </section>

        <section className="pb-card">
          <h2>Chọn buổi tập</h2>
          <div className="pb-legend"><span><i />Còn slot</span><span><i className="full" />Full lớp</span></div>
          {loadErr && <p className="pb-bad" role="alert">{loadErr}</p>}
          {!data && !loadErr && <p className="pb-muted">Đang tải lịch...</p>}
          {data && data.sessions.length === 0 && <p className="pb-muted">Tuần này chưa có buổi nào để đăng ký.</p>}
          {data && (
            <div className="pb-grid" style={{ gridTemplateColumns: `64px repeat(${slots.length}, 1fr)` }} aria-live="polite">
              <div />
              {slots.map((k) => <div key={k} className="pb-colhead">{slotLabel(k)}</div>)}
              {days.map((d) => (
                <div key={d} className="pb-row" style={{ display: 'contents' }}>
                  <div className={`pb-dayhead ${d === today ? 'today' : ''}`}>
                    <b>{DOW[dowOf(d)]}</b>
                    <small>{d === today ? 'Hôm nay' : dm(d)}</small>
                  </div>
                  {slots.map((k) => {
                    const s = cell.get(`${d}|${k}`)
                    if (!s) return <div key={k} className="pb-empty" />
                    const on = picked.includes(s.id)
                    const full = s.left <= 0
                    return (
                      <button
                        key={k}
                        type="button"
                        className={`pb-cell ${on ? 'on' : ''} ${full ? 'full' : ''} ${shake === s.id ? 'shake' : ''}`}
                        aria-pressed={on}
                        disabled={full}
                        aria-label={`${DOW[dowOf(d)]} ${dm(d)}, ${s.start}-${s.end}, ${s.muscle_group ?? 'PT nhóm'}, ${full ? 'Full lớp' : `Còn ${s.left} slot`}`}
                        onClick={() => toggle(s)}
                      >
                        <span className="pb-muscle">{s.muscle_group ?? 'PT nhóm'}</span>
                        <span className={`pb-left ${s.left === 1 ? 'last' : ''}`}>{full ? 'Full lớp' : `Còn ${s.left} slot`}</span>
                        {on && <i className="pb-check" aria-hidden="true">✓</i>}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="pb-card pb-rules">
          <h2>QUY ĐỊNH BOOKING LỚP PT NHÓM</h2>
          <h3>1. Số lượng hội viên &amp; Lịch tập</h3>
          <ul>
            <li>Mỗi lớp tối đa 3 hội viên.</li>
            <li>Khi lớp đã đủ số lượng, lịch buổi đó sẽ tự động ẩn hoặc hiển thị thông báo "Full lớp" để hội viên chọn khung giờ khác.</li>
            <li>Hội viên vui lòng đăng ký sớm mỗi tuần để đảm bảo giữ slot mong muốn. Mỗi tuần đăng ký tối đa 5 buổi.</li>
          </ul>
          <h3>2. Thời gian Booking</h3>
          <ul>
            <li>Lịch tập của ngày hôm sau sẽ tự động khoá vào lúc 21h hàng ngày.</li>
            <li>Hội viên đã booking nhưng không tham gia vẫn bị tính là một buổi học, vì đã chiếm slot của hội viên khác.</li>
          </ul>
          <h3>3. Huỷ hoặc Đổi lịch tập</h3>
          <ul>
            <li>Lịch đã booking không thể tự huỷ hoặc thay đổi.</li>
            <li>Trường hợp cần huỷ hoặc điều chỉnh, hội viên phải báo trước ít nhất 12 tiếng qua fanpage: TH Gym &amp; Fitness Quận 7</li>
            <li>Ví dụ: Nếu muốn huỷ lớp Thứ 3 - 6h30 sáng, vui lòng báo huỷ trước Thứ 2 - 18h30 để bộ phận admin hỗ trợ, và để hội viên khác có thể đăng ký vào.</li>
          </ul>
          <h3>4. Thời lượng buổi tập</h3>
          <ul>
            <li>60 phút: tập luyện chính cùng HLV.</li>
            <li>10 - 15 phút: chuẩn bị, khởi động và thời gian dự phòng.</li>
          </ul>
          <p className="pb-closing">Hội viên vui lòng tuân thủ quy định để đảm bảo trải nghiệm luyện tập hiệu quả, công bằng và chuyên nghiệp cho tất cả thành viên.</p>
        </section>
        <footer className="pb-foot">TH GYM &amp; FITNESS - Rèn luyện cùng nhau, chạm đỉnh phong độ!</footer>
        <p className="pb-copy">@copyright_THGym_2025</p>
        <div style={{ height: 110 }} />
      </main>

      {zoom && (
        <div className="pb-lightbox" role="dialog" aria-label="Lịch lớp" onClick={() => setZoom(false)}>
          <button type="button" aria-label="Đóng" onClick={() => setZoom(false)}>×</button>
          <img src={poster} alt="Lịch PT nhóm Nhập môn Gym" />
        </div>
      )}
      <div className="pb-bar">
        {msg && <p className="pb-bad" role="alert">{msg}</p>}
        <div className="pb-barrow">
          <div>
            <b>{picked.length} / {max} buổi</b>
            <div className="pb-dots" aria-hidden="true">{Array.from({ length: max }, (_, i) => <i key={i} className={i < picked.length ? 'on' : ''} />)}</div>
          </div>
          <button type="button" className="pb-btn" disabled={busy || picked.length === 0} onClick={submit}>{busy ? 'Đang gửi...' : 'Xác nhận đăng ký'}</button>
        </div>
      </div>
    </div>
  )
}

function Header() {
  return (
    <header className="pb-header">
      <img src="/logo.png" alt="" width={40} height={40} />
      <h1>ĐẶT LỊCH PT NHÓM</h1>
    </header>
  )
}
