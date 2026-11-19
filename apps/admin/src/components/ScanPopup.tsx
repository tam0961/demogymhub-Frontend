import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDate, fmtMoney } from '../lib/format'
import { useAuth } from '../context/AuthContext'
import { usePermission } from '../context/usePermission'
import { MemberAvatar } from './MemberAvatar'
import { Button, Chip } from './ui'

interface ScanMember {
  id: string; code: string; name: string; phone: string; has_photo: boolean; photo_version: number | null
  package_name: string | null; end_date: string | null; state: 'ok' | 'expired' | 'frozen' | 'not_started' | 'no_package'
  sessions_left: number | null; debt: number
}
interface ScanItem { id: string; employee_no: string; scanned_at: string; member: ScanMember | null }

const STATE: Record<ScanMember['state'], { label: string; tone: 'ok' | 'warn' | 'bad' }> = {
  ok: { label: 'Còn hạn', tone: 'ok' },
  expired: { label: 'Hết hạn', tone: 'bad' },
  frozen: { label: 'Đang bảo lưu', tone: 'warn' },
  not_started: { label: 'Chưa bắt đầu', tone: 'warn' },
  no_package: { label: 'Chưa có gói', tone: 'bad' },
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
    const t = setInterval(tick, 3000)
    return () => { alive = false; clearInterval(t) }
  }, [allowed])

  const next = useCallback(() => { setMsg(''); setQueue((q) => q.slice(1)) }, [])

  useEffect(() => {
    if (!cur) return
    const t = setTimeout(next, 20000)
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

  return (
    <div className="scan-pop" role="alertdialog" aria-live="assertive" aria-label="Khách vừa quét mặt">
      {m ? (
        <>
          <div className="scan-head">
            <MemberAvatar member={{ id: m.id, name: m.name, has_photo: m.has_photo, photo_version: m.photo_version }} size={56} />
            <div>
              <b>{m.name}</b>
              <div className="cell-sub">{m.code} · {m.phone}</div>
            </div>
            <Chip tone={STATE[m.state].tone}>{STATE[m.state].label}</Chip>
          </div>
          <div className="scan-body">
            <div>{m.package_name ?? 'Chưa có gói member'}{m.end_date ? `, đến ${fmtDate(m.end_date)}` : ''}</div>
            {m.sessions_left != null && <div className="cell-sub">Còn {m.sessions_left} buổi</div>}
            {m.debt > 0 && <div className="scan-debt">Còn nợ {fmtMoney(m.debt)}</div>}
            {msg && <div className="form-error" role="alert">{msg}</div>}
          </div>
          <div className="scan-foot">
            {canCheckin && <Button variant="primary" onClick={checkin}>Check-in</Button>}
            <Button onClick={next}>Đóng</Button>
          </div>
        </>
      ) : (
        <>
          <div className="scan-head"><div><b>Không nhận ra khách</b><div className="cell-sub">Mã trên máy: {cur.employee_no}</div></div></div>
          <div className="scan-body cell-sub">Mã này chưa khớp Face ID, mã hội viên hay số điện thoại nào.</div>
          <div className="scan-foot"><Button onClick={next}>Đóng</Button></div>
        </>
      )}
      {queue.length > 1 && <div className="cell-sub scan-more">Còn {queue.length - 1} lượt quét nữa</div>}
    </div>
  )
}
