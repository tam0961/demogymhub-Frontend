import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { daysLeftText, fmtDate, fmtMoney } from '../lib/format'
import { usePermission } from '../context/usePermission'
import { MemberAvatar } from './MemberAvatar'
import { Button } from './ui'

interface ScanMember {
  id: string; code: string; name: string; phone: string; has_photo: boolean; photo_version: number | null
  package_name: string | null; end_date: string | null; state: 'ok' | 'expired' | 'frozen' | 'not_started' | 'no_package'
  sessions_left: number | null; debt: number
  branch?: { code: string; name: string } | null; contract_id?: string | null; checkin_before?: string | null
  debt_contract?: { id: string; code: string; amount: number } | null
  pt?: { package_name: string; sessions_left: number | null; sessions_total: number | null } | null
}
interface ScanItem { id: string; employee_no: string; scanned_at: string; result: 'allowed' | 'denied' | null; reason: string | null; member: ScanMember | null }

const REASON: Record<string, { label: string; tone: 'warn' | 'bad' }> = {
  EXPIRED: { label: 'Hết hạn', tone: 'bad' },
  FROZEN: { label: 'Đang bảo lưu', tone: 'warn' },
  NO_SESSIONS: { label: 'Hết buổi', tone: 'bad' },
  OUTSIDE_HOURS: { label: 'Quá giờ của gói', tone: 'warn' },
  NO_ACTIVE_CONTRACT: { label: 'Chưa có gói', tone: 'bad' },
  WRONG_BRANCH: { label: 'Sai chi nhánh', tone: 'bad' },
}

type Tone = 'ok' | 'warn' | 'bad'

function verdict(it: ScanItem): { label: string; tone: Tone } {
  if (!it.member) return { label: 'Không nhận ra khách', tone: 'bad' }
  if (it.result === 'allowed') return { label: 'Cho vào', tone: 'ok' }
  return REASON[it.reason ?? ''] ?? { label: 'Không cho vào', tone: 'bad' }
}

function packageChip(m: ScanMember): { label: string; tone: Tone } {
  if (m.state === 'expired') return { label: 'Hết hạn', tone: 'bad' }
  if (m.state === 'frozen') return { label: 'Đang bảo lưu', tone: 'warn' }
  if (m.state === 'not_started') return { label: 'Chưa bắt đầu', tone: 'warn' }
  if (m.state === 'no_package') return { label: 'Chưa có gói', tone: 'bad' }
  const left = m.end_date ? Math.ceil((Date.parse(m.end_date) - Date.parse(new Date().toISOString().slice(0, 10))) / 86400000) : null
  if (left != null && left <= 7) return { label: 'Sắp hết hạn', tone: 'warn' }
  return { label: 'Đang hoạt động', tone: 'ok' }
}

const hourText = (hm: string) => {
  const [h, m] = hm.split(':')
  return m && m !== '00' ? `${Number(h)}h${m}` : `${Number(h)}h`
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
  const nav = useNavigate()
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
  const at = new Date(cur.scanned_at)
  const hm = at.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false })
  const chip = m ? packageChip(m) : null
  const outside = cur.reason === 'OUTSIDE_HOURS'
  const go = (to: string) => { next(); nav(to) }
  return (
    <>
    {warn}
    <div className="scan-overlay" role="alertdialog" aria-live="assertive" aria-label="Khách vừa quét mặt">
      <div className={`scan-card scan-${v.tone}`}>
        <div className="scan-banner">
          <div className="scan-title">{v.label}</div>
          {m && <span className="scan-meta">{hm}{m.branch ? ` ${m.branch.name}` : ''}</span>}
          <button type="button" className="scan-x" aria-label="Đóng" onClick={next}>&times;</button>
        </div>
        {m ? (
          <>
            <div className="scan-person">
              <MemberAvatar member={{ id: m.id, name: m.name, has_photo: m.has_photo, photo_version: m.photo_version }} size={192} />
              <div>
                <div className="scan-name">{m.name}</div>
                <div className="scan-sub">{m.code} · {m.phone}</div>
              </div>
            </div>
            <dl className="scan-rows">
              <div className="scan-row">
                <dt>Giờ vào</dt>
                <dd>
                  <b>{hm}</b>
                  <span className={`scan-chip ${cur.result === 'allowed' ? 'ok' : v.tone}`}>{cur.result === 'allowed' ? 'Đúng giờ' : v.label}</span>
                  {outside && m.checkin_before && <div className="scan-hint">Gói chỉ vào tập trước {hourText(m.checkin_before)}, cần xử lý (thu bù hoặc đổi gói).</div>}
                </dd>
              </div>
              <div className="scan-row">
                <dt>Gói tập</dt>
                <dd>
                  <b>{m.package_name ?? 'Chưa có gói member'}</b>
                  {chip && <span className={`scan-chip ${chip.tone}`}>{chip.label}</span>}
                  {m.end_date && <div className="scan-hint">Đến {fmtDate(m.end_date)}{days ? `, ${days}` : ''}</div>}
                  {m.checkin_before && <div className="scan-hint">Gói chỉ vào tập trước {hourText(m.checkin_before)}</div>}
                </dd>
              </div>
              {m.pt && (
                <div className="scan-row">
                  <dt>Gói PT</dt>
                  <dd><b>{m.pt.package_name}</b>{m.pt.sessions_left != null ? `: còn ${m.pt.sessions_left} buổi` : ''}</dd>
                </div>
              )}
              <div className="scan-row">
                <dt>Công nợ</dt>
                <dd>{m.debt > 0 ? <><span className="scan-debt">{fmtMoney(m.debt)}</span>{m.debt_contract ? ` (${m.debt_contract.code})` : ''}</> : 'Không có'}</dd>
              </div>
            </dl>
            <div className="scan-foot">
              <Button onClick={() => go(`/members?q=${encodeURIComponent(m.code)}`)}>Mở hồ sơ</Button>
              {m.debt_contract && <Button onClick={() => go(`/contracts/${m.debt_contract!.id}`)}>Thu tiền</Button>}
              {cur.result !== 'allowed' && m.contract_id && <Button onClick={() => go(`/contracts/${m.contract_id}`)}>Gia hạn</Button>}
            </div>
          </>
        ) : (
          <>
            <div className="scan-plain">
              Máy chấm công báo mã <b>{cur.employee_no}</b>, chưa khớp hội viên nào.
              <div className="scan-hint">Nhập mã này vào ô Face ID của hội viên (Hồ sơ hội viên) để lần sau nhận ra.</div>
            </div>
            <div className="scan-foot"><Button onClick={next}>Đóng</Button></div>
          </>
        )}
        {queue.length > 1 && <div className="scan-more">Còn {queue.length - 1} lượt quét nữa</div>}
      </div>
    </div>
    </>
  )
}
