import { useEffect, useRef } from 'react'
import { fmtDate, fmtTime } from '../lib/format'
import { getIpadSession, setIpadStage } from '../lib/ipad'
import { useBranch } from '../context/BranchContext'
import { Modal } from './Modal'
import { IpadPairBox, useBranchIpad } from './IpadPairBox'
import { Button } from './ui'
import type { PtSession } from '../types'

export function PtSignModal({ session, onClose, onConfirmed, onCancel }: { session: PtSession; onClose: () => void; onConfirmed: (s: PtSession) => void; onCancel?: (s: PtSession) => void }) {
  const { branchId } = useBranch()
  const branch = session.branch_id ?? branchId ?? ''
  const { token, loaded, refresh } = useBranchIpad(branch)
  const done = useRef(false)
  const sessionRef = useRef(session)
  const confirmedRef = useRef(onConfirmed)
  confirmedRef.current = onConfirmed
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel

  useEffect(() => () => { if (!done.current) cancelRef.current?.(sessionRef.current) }, [])

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
      {!loaded ? <p className="hint-muted">Đang kiểm tra iPad...</p> : <IpadPairBox branchId={branch} token={token} onChanged={refresh} />}
      {token && <p className="hint-muted" style={{ marginTop: 8 }}>Đã gửi lên iPad quầy, đang chờ khách ký...</p>}
    </Modal>
  )
}
