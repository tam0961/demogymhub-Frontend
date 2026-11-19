import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { daysLeftText, fmtDate, fmtMoney } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { usePermission } from '../context/usePermission'
import { MemberAvatar } from './MemberAvatar'
import { Button } from './ui'

interface ScanMember {
  id: string; code: string; name: string; phone: string; has_photo: boolean; photo_version: number | null
  package_name: string | null; end_date: string | null; state: 'ok' | 'expired' | 'frozen' | 'not_started' | 'no_package'
  sessions_left: number | null; debt: number
}
interface ScanItem { id: string; employee_no: string; scanned_at: string; member: ScanMember | null }

const STATE: Record<ScanMember['state'], { label: string; tone: 'ok' | 'warn' | 'bad' }> = {
  ok: { label: 'CÒN HẠN', tone: 'ok' },
  expired: { label: 'HẾT HẠN', tone: 'bad' },
  frozen: { label: 'ĐANG BẢO LƯU', tone: 'warn' },
  not_started: { label: 'CHƯA BẮT ĐẦU', tone: 'warn' },
  no_package: { label: 'CHƯA CÓ GÓI', tone: 'bad' },
}

function beep(ok: boolean) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    const tone = (freq: number, at: number) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = freq
      g.gain.value = 0.15
      o.connect(g)
      g.connect(ctx.destination)
      o.start(ctx.currentTime + at)
      o.stop(ctx.currentTime + at + 0.14)
    }
    if (ok) tone(880, 0)
    else { tone(330, 0); tone(330, 0.2) }
    setTimeout(() => ctx.close(), 800)
  } catch { /* trình duyệt chặn âm thanh: bỏ qua */ }
}

export default function ScanPopup() {
  const { user } = useAuth()
  const { can } = usePermission()
  const allowed = can('checkins.read')
  const canCheckin = can('checkins.create') && !user?.roles.some((r) => r === 'owner' || r === 'super_admin')
  const since = useRef<string | null>(null)
  const [queue, setQueue] = useState<ScanItem[]>([])
  const [msg, setMsg] = useState('')
  const cur = queue[0]

  useEffect(() => {
    if (!allowed) return
    let alive = true
    const tick = async () => {
      if (document.hidden) return
      try {
        const { data } = await api.get<{ data: { now: string; items: ScanItem[] } }>('/attendance/scans', { params: since.current ? { since: since.current } : {} })
        if (!alive) return
        since.current = data.data.now
        if (data.data.items.length) setQueue((q) => [...q, ...data.data.items])
      } catch { /* mạng chập chờn: lần hỏi sau tự thử lại */ }
    }
    tick()
    const t = setInterval(tick, 1500)
    return () => { alive = false; clearInterval(t) }
  }, [allowed])

  const next = useCallback(() => { setMsg(''); setQueue((q) => q.slice(1)) }, [])

  useEffect(() => {
    if (!cur) return
    beep(!!cur.member && cur.member.state === 'ok')
    const t = setTimeout(next, 30000)
    return () => clearTimeout(t)
  }, [cur, next])

  if (!cur) return null
  const m = cur.member
  const checkin = async () => {
    if (!m) return
    try {
      const { data } = await api.post<{ data: { result: 'allowed' | 'denied'; reason: string | null } }>('/checkins', { member_code: m.code, direction: 'in' })
      if (data.data.result === 'allowed') next()
      else setMsg(`Không cho vào: ${data.data.reason ?? 'không đủ điều kiện'}`)
    } catch (e) {
      setMsg(apiError(e).message)
    }
  }

  const tone = m ? STATE[m.state].tone : 'bad'
  const days = m?.end_date ? daysLeftText(m.end_date) : ''
  return (
    <div className="scan-overlay" role="alertdialog" aria-live="assertive" aria-label="Khách vừa quét mặt">
      <div className={`scan-card scan-${tone}`}>
        <div className="scan-banner">{m ? STATE[m.state].label : 'KHÔNG NHẬN RA KHÁCH'}</div>
        {m ? (
          <>
            <div className="scan-person">
              <MemberAvatar member={{ id: m.id, name: m.name, has_photo: m.has_photo, photo_version: m.photo_version }} size={96} />
              <div>
                <div className="scan-name">{m.name}</div>
                <div className="scan-sub">{m.code} · {m.phone}</div>
                <div className="scan-sub">Quét lúc {new Date(cur.scanned_at).toLocaleTimeString('vi-VN')}</div>
              </div>
            </div>
            <dl className="scan-info">
              <dt>Gói</dt><dd>{m.package_name ?? 'Chưa có gói member'}</dd>
              {m.end_date && (<><dt>Hạn đến</dt><dd>{fmtDate(m.end_date)}{days ? ` (${days})` : ''}</dd></>)}
              {m.sessions_left != null && (<><dt>Còn lại</dt><dd>{m.sessions_left} buổi</dd></>)}
            </dl>
            {m.debt > 0 && <div className="scan-debt-bar">Còn nợ {fmtMoney(m.debt)}</div>}
            {msg && <div className="form-error" role="alert">{msg}</div>}
            <div className="scan-foot">
              {canCheckin && <Button variant="primary" className="scan-btn" onClick={checkin}>Check-in</Button>}
              <Button className="scan-btn" onClick={next}>Đóng</Button>
            </div>
          </>
        ) : (
          <>
            <div className="scan-info-plain">Mã trên máy: <b>{cur.employee_no}</b><br />Mã này chưa khớp Face ID, mã hội viên hay số điện thoại nào.</div>
            <div className="scan-foot"><Button className="scan-btn" onClick={next}>Đóng</Button></div>
          </>
        )}
        {queue.length > 1 && <div className="scan-more">Còn {queue.length - 1} lượt quét nữa</div>}
      </div>
    </div>
  )
}
