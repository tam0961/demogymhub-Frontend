import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDateTime } from '../lib/format'
import { Modal } from './Modal'
import { Button, Chip, useToast } from './ui'

interface Job { id: string; device_name: string; status: 'pending' | 'claimed' | 'done' | 'failed'; message: string | null; created_at: string }

const TONE = { pending: 'warn', claimed: 'warn', done: 'ok', failed: 'bad' } as const
const LABEL = { pending: 'Đang chờ máy', claimed: 'Đang gửi', done: 'Đã đăng ký', failed: 'Lỗi' } as const

export function useFaceJobs(memberId: string, enabled: boolean) {
  const [jobs, setJobs] = useState<Job[]>([])
  const load = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: Job[] }>('/attendance/face-jobs', { params: { member_id: memberId } })
      setJobs(data.data)
    } catch { setJobs([]) }
  }, [memberId])
  useEffect(() => { if (enabled) load() }, [enabled, load])
  const open = jobs.some((j) => j.status === 'pending' || j.status === 'claimed')
  useEffect(() => {
    if (!enabled || !open) return
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [enabled, open, load])
  return { jobs, reload: load }
}

export function FaceJobsLine({ jobs }: { jobs: Job[] }) {
  if (!jobs.length) return null
  return (
    <div className="cell-sub" style={{ margin: '6px 0' }}>
      Máy chấm công:{' '}
      {jobs.slice(0, 2).map((j) => (
        <span key={j.id} style={{ marginRight: 10 }}>
          {j.device_name} <Chip tone={TONE[j.status]}>{LABEL[j.status]}</Chip> {fmtDateTime(j.created_at)}
          {j.status === 'failed' && j.message ? ` - ${j.message}` : ''}
        </span>
      ))}
    </div>
  )
}

export function FaceDeviceSend({ memberId, memberName, hasPhoto, onSent }: { memberId: string; memberName: string; hasPhoto: boolean; onSent: () => void }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const send = async () => {
    setBusy(true)
    setErr('')
    try {
      await api.post('/attendance/face-jobs', { member_id: memberId, consent: true })
      toast('Đã gửi yêu cầu, máy chấm công sẽ nhận trong vài giây')
      setOpen(false)
      setAgree(false)
      onSent()
    } catch (e) {
      setErr(apiError(e).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button disabled={!hasPhoto} title={hasPhoto ? undefined : 'Cần chụp hoặc tải ảnh khuôn mặt trước'} onClick={() => { setErr(''); setOpen(true) }}>Gửi mặt lên máy chấm công</Button>
      {open && (
        <Modal
          title="Gửi khuôn mặt lên máy chấm công"
          onClose={() => setOpen(false)}
          footer={<><Button onClick={() => setOpen(false)}>Hủy</Button><Button variant="primary" disabled={!agree || busy} onClick={send}>{busy ? 'Đang gửi...' : 'Gửi lên máy'}</Button></>}
        >
          <p>Ảnh khuôn mặt của <b>{memberName}</b> sẽ được thêm vào máy chấm công của chi nhánh để khách vào cửa bằng khuôn mặt.</p>
          <p className="cell-sub">Dữ liệu khuôn mặt là dữ liệu cá nhân nhạy cảm (Nghị định 13/2023). Chỉ gửi khi khách đã được thông báo và đồng ý.</p>
          <label className="check" style={{ display: 'block', margin: '10px 0' }}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> Khách đã đồng ý lưu và dùng khuôn mặt để vào cửa
          </label>
          {err && <div className="form-error" role="alert">{err}</div>}
        </Modal>
      )}
    </>
  )
}
