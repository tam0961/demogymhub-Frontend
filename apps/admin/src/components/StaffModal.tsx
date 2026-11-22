import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { Modal } from './Modal'
import { useToast } from './Toast'
import { Button, Field, Select } from './ui'
import type { Contract } from '../types'

interface Staff { id: string; name: string }

export function StaffModal({ contract, onClose, onDone }: { contract: Contract; onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [pts, setPts] = useState<Staff[]>([])
  const [ptId, setPtId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    api.get<{ data: Staff[] }>('/contracts/pt-staff', { params: { branch_id: contract.branch_id } }).then((r) => { if (alive) setPts(r.data.data) }).catch(() => {})
    return () => { alive = false }
  }, [contract.branch_id])

  const save = async () => {
    setBusy(true)
    setErr('')
    try {
      await api.patch(`/contracts/${contract.id}/staff`, { pt_user_id: ptId })
      toast('Đã đổi PT phụ trách')
      onDone()
    } catch (e) {
      setErr(apiError(e).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Đổi PT phụ trách - ${contract.code}`}
      onClose={onClose}
      footer={<><Button onClick={onClose} disabled={busy}>Hủy</Button><Button variant="primary" onClick={save} disabled={busy || !ptId || ptId === contract.pt?.id}>{busy ? 'Đang lưu...' : 'Lưu'}</Button></>}
    >
      {err && <div className="form-error" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      <Field label="PT hiện tại" htmlFor="sm-cur"><input id="sm-cur" className="input" readOnly value={contract.pt?.name ?? 'Chưa gán'} /></Field>
      <Field label="PT mới (khác PT hiện tại)" htmlFor="sm-pt">
        <Select id="sm-pt" value={ptId} onChange={(e) => setPtId(e.target.value)}>
          <option value="">Chọn PT mới</option>
          {pts.filter((u) => u.id !== contract.pt?.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </Field>
    </Modal>
  )
}
