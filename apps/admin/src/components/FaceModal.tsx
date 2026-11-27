import { useEffect, useState } from 'react'
import { apiError } from '../lib/errors'
import type { ProcessedPhoto } from '../lib/photo'
import { Button, Modal } from './ui'
import { loadPhoto, type PhotoRef } from './MemberAvatar'
import { DeviceCam } from './DeviceCam'

export interface FaceResult { photo: ProcessedPhoto | null; faceId: string }

interface Props {
  member?: PhotoRef | null
  initialPhoto?: ProcessedPhoto | null
  initialFaceId?: string
  onSave: (r: FaceResult) => Promise<void>
  onClose: () => void
  onSent?: () => void
}

export function FaceModal({ member, initialPhoto, initialFaceId = '', onSave, onClose }: Props) {
  const [photo, setPhoto] = useState<ProcessedPhoto | null>(initialPhoto ?? null)
  const [current, setCurrent] = useState<string | null>(null)
  const faceId = initialFaceId
  const [formErr, setFormErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!member?.has_photo) return
    let alive = true
    loadPhoto({ id: member.id, photo_version: member.photo_version }).then((u) => { if (alive) setCurrent(u) })
    return () => { alive = false }
  }, [member])

  const save = async () => {
    setBusy(true)
    setFormErr('')
    try {
      await onSave({ photo, faceId: faceId.trim() })
      onClose()
    } catch (e) {
      const a = apiError(e)
      if (a.status === 409 || a.code === 'DUPLICATE_FACE_ID') setFormErr('Face ID này đã được dùng cho hội viên khác')
      else if (a.code === 'INVALID_IMAGE') setFormErr('Ảnh không hợp lệ, hãy chọn ảnh khác.')
      else if (a.code === 'PHOTO_TOO_LARGE') setFormErr('Ảnh quá lớn, hãy chọn ảnh khác.')
      else setFormErr(a.message)
    } finally {
      setBusy(false)
    }
  }

  const preview = photo?.dataUrl ?? current
  return (
    <Modal
      title="Chụp ảnh và đăng ký khuôn mặt"
      size="large"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Hủy</Button>
          <Button variant="primary" onClick={save} disabled={busy}>{busy ? 'Đang lưu...' : 'Xong'}</Button>
        </>
      }
    >
      {formErr && <div className="form-error" role="alert" style={{ marginBottom: 12 }}>{formErr}</div>}
      <div className="face-grid">
        <div className="face-side">
          <div className="face-photo">{preview ? <img src={preview} alt="Ảnh hồ sơ" /> : <span className="hint-muted">Chưa có ảnh</span>}</div>
          <div className="hint-muted">Ảnh hồ sơ</div>
        </div>
        <div className="face-main">
          <DeviceCam onPhoto={setPhoto} />
          <div className="hint-muted">Khách nhìn thẳng vào máy chấm công, đủ sáng, không đội nón hay đeo khẩu trang. Chỉ một người trong khung.</div>
        </div>
      </div>
    </Modal>
  )
}
