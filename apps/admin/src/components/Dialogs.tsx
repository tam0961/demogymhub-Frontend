import { useState, type FormEvent, type ReactNode } from 'react'
import { Modal } from './Modal'
import { Button, Field } from './ui'

interface ConfirmProps {
  title: string
  message: ReactNode
  confirmLabel: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}
export function ConfirmDialog({ title, message, confirmLabel, danger, busy, onConfirm, onClose }: ConfirmProps) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>{busy ? 'Đang xử lý...' : confirmLabel}</Button>
        </>
      }
    >
      <div>{message}</div>
    </Modal>
  )
}

interface FormDialogProps {
  title: string
  confirmLabel: string
  danger?: boolean
  reasonLabel?: string
  reasonRequired?: boolean
  error?: string
  busy?: boolean
  extra?: ReactNode
  intro?: ReactNode
  onSubmit: (reason: string) => void
  onClose: () => void
}
export function FormDialog({ title, confirmLabel, danger, reasonLabel = 'Lý do', reasonRequired = true, error, busy, extra, intro, onSubmit, onClose }: FormDialogProps) {
  const [reason, setReason] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onSubmit(reason.trim())
  }
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant={danger ? 'danger' : 'primary'} type="submit" form="form-dialog" disabled={busy}>{busy ? 'Đang xử lý...' : confirmLabel}</Button>
        </>
      }
    >
      <form id="form-dialog" className="stack" onSubmit={submit}>
        {intro}
        {error && <div className="form-error" role="alert">{error}</div>}
        {extra}
        <Field label={reasonLabel} htmlFor="fd-reason">
          <textarea id="fd-reason" className="input" rows={3} required={reasonRequired} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </form>
    </Modal>
  )
}
