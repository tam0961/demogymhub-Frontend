import { useEffect, useRef, useState } from 'react'
import { fmtDate, fmtTime } from '../lib/format'
import { createIpadSession, getIpadSession, ipadUrl, setIpadStage } from '../lib/ipad'
import { Modal } from './Modal'
import { QRImage } from './QRImage'
import { Button, useToast } from './ui'
import type { PtSession } from '../types'

export function PtSignModal({ session, onClose, onConfirmed }: { session: PtSession; onClose: () => void; onConfirmed: (s: PtSession) => void }) {
  const toast = useToast()
  const [token, setToken] = useState('')
  const done = useRef(false)
  const sessionRef = useRef(session)
  const confirmedRef = useRef(onConfirmed)
  confirmedRef.current = onConfirmed

  useEffect(() => {
    let alive = true
    createIpadSession().then((t) => { if (alive) setToken(t) }).catch(() => { if (alive) setToken('') })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!token) return
    const s = sessionRef.current
    const left = s.sessions_left != null ? Math.max(0, s.sessions_left - 1) : null
    const rows: [string, string][] = [
      ['Khách', s.member?.name ?? '-'],
      ['PT', s.trainer.name],
      ['Giờ', `${fmtDate(s.start_at)} ${fmtTime(s.start_at)} - ${fmtTime(s.end_at)}`],
    ]
    if (left != null) rows.push(['Số buổi còn lại sau buổi này', `${left} buổi`])
    setIpadStage(token, 'sign', { title: 'Xác nhận buổi tập PT', rows, consent: 'Tôi xác nhận đã tập xong buổi PT này' }).catch(() => {})
    const id = window.setInterval(() => {
      getIpadSession(token).then((r) => {
        if (r.stage === 'signed' && !done.current) {
          done.current = true
          setIpadStage(token, 'idle', null).catch(() => {})
          onClose()
          confirmedRef.current(sessionRef.current)
        }
      }).catch(() => {})
    }, 2000)
    return () => {
      window.clearInterval(id)
      if (!done.current) setIpadStage(token, 'idle', null).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return (
    <Modal title="Khách xác nhận buổi tập" onClose={onClose} footer={<Button onClick={onClose}>Hủy</Button>}>
      <div className="sign-wait">
        <div className="sign-ico" aria-hidden="true">✍</div>
        <h3>Mở iPad cho khách ký xác nhận</h3>
        <p>Khách ký trên iPad, hệ thống tự ghi nhận buổi, trừ 1 buổi và gửi tin Zalo số buổi còn lại. Chưa ký thì chưa tính.</p>
      </div>
      {token ? (
        <div className="ipad-box">
          <QRImage text={ipadUrl(token)} size={110} />
          <div>
            <div className="cell-main">Quét mã hoặc mở liên kết trên iPad</div>
            <div className="ipad-link hint-muted">{ipadUrl(token)}</div>
            <Button small onClick={() => navigator.clipboard?.writeText(ipadUrl(token)).then(() => toast('Đã sao chép liên kết iPad')).catch(() => {})}>Sao chép liên kết</Button>
          </div>
        </div>
      ) : (
        <p className="hint-muted">Đang tạo liên kết iPad...</p>
      )}
    </Modal>
  )
}
