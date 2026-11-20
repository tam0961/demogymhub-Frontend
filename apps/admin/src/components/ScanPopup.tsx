import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { daysLeftText, fmtDate, fmtMoney } from '../lib/format'
import { usePermission } from '../context/usePermission'
import { MemberAvatar } from './MemberAvatar'
import { Button } from './ui'

interface ScanMember {
  id: string; code: string; name: string; phone: string; has_photo: boolean; photo_version: number | null
  package_name: string | null; end_date: string | null; state: 'ok' | 'expired' | 'frozen' | 'not_started' | 'no_package'
  sessions_left: number | null; debt: number
}
interface ScanItem { id: string; employee_no: string; scanned_at: string; result: 'allowed' | 'denied' | null; reason: string | null; member: ScanMember | null }

const REASON: Record<string, { label: string; tone: 'warn' | 'bad' }> = {
  EXPIRED: { label: 'HẾT HẠN', tone: 'bad' },
  FROZEN: { label: 'ĐANG BẢO LƯU', tone: 'warn' },
  NO_SESSIONS: { label: 'HẾT BUỔI', tone: 'bad' },
  OUTSIDE_HOURS: { label: 'NGOÀI GIỜ GÓI', tone: 'warn' },
  NO_ACTIVE_CONTRACT: { label: 'CHƯA CÓ GÓI', tone: 'bad' },
  WRONG_BRANCH: { label: 'SAI CHI NHÁNH', tone: 'bad' },
}

function verdict(it: ScanItem): { label: string; tone: 'ok' | 'warn' | 'bad' } {
  if (!it.member) return { label: 'KHÔNG NHẬN RA KHÁCH', tone: 'bad' }
  if (it.result === 'allowed') return { label: 'ĐÃ CHECK-IN', tone: 'ok' }
  if (it.result === 'denied') return REASON[it.reason ?? ''] ?? { label: 'KHÔNG CHO VÀO', tone: 'bad' }
  return STATE[it.member.state]
}

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
  const { can } = usePermission()
  const allowed = can('checkins.read')
  const since = useRef<string | null>(null)
  const [queue, setQueue] = useState<ScanItem[]>([])
  const [bridgeOk, setBridgeOk] = useState<boolean | null>(null)
  const [paused, setPaused] = useState<boolean | null>(null)
  const cur = queue[0]

  useEffect(() => {
    if (!allowed) return
    let alive = true
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const loop = async () => {
      while (alive) {
        if (document.hidden) { await sleep(1500); continue }
        try {
          const params: Record<string, string | number> = { wait: 20 }
          if (since.current) params.since = since.current
          const { data } = await api.get<{ data: { now: string; items: ScanItem[]; bridge_ok: boolean | null; paused?: boolean | null } }>('/attendance/scans', { params, timeout: 35000 })
          if (!alive) return
          since.current = data.data.now
          setBridgeOk(data.data.bridge_ok)
          setPaused(data.data.paused ?? null)
          if (data.data.items.length) setQueue((q) => [...q, ...data.data.items])
        } catch {
          await sleep(2000)
        }
      }
    }
    loop()
    return () => { alive = false }
  }, [allowed])

  const next = useCallback(() => { setQueue((q) => q.slice(1)) }, [])

  useEffect(() => {
    if (!cur) return
    beep(cur.result === 'allowed')
    const t = setTimeout(next, cur.result === 'allowed' ? 10000 : 25000)
    return () => clearTimeout(t)
  }, [cur, next])

  const warn = bridgeOk === false && !paused ? <div className="scan-offline" role="alert">Cầu nối máy chấm công đang tắt. Khách quét mặt sẽ không hiện popup và không tự check-in. Hãy mở lại chay-quet.bat trên máy này.</div> : null
  if (!cur) return warn
  const m = cur.member
  const v = verdict(cur)
  const days = m?.end_date ? daysLeftText(m.end_date) : ''
  return (
    <>
    {warn}
    <div className="scan-overlay" role="alertdialog" aria-live="assertive" aria-label="Khách vừa quét mặt">
      <div className={`scan-card scan-${v.tone}`}>
        <div className="scan-banner">{v.label}</div>
        {m ? (
          <>
            <div className="scan-person">
              <MemberAvatar member={{ id: m.id, name: m.name, has_photo: m.has_photo, photo_version: m.photo_version }} size={192} />
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
            <div className="scan-foot">
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
    </>
  )
}
