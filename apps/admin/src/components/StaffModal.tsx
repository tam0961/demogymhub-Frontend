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
  const [sales, setSales] = useState<Staff[]>([])
  const [pts, setPts] = useState<Staff[]>([])
  const [saleId, setSaleId] = useState(contract.sale?.id ?? '')
  const [ptId, setPtId] = useState(contract.pt?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const needPt = contract.package.category.startsWith('pt_')

  useEffect(() => {
    let alive = true
    api.get<{ data: Staff[] }>('/contracts/sale-staff', { params: { branch_id: contract.branch_id } }).then((r) => { if (alive) setSales(r.data.data) }).catch(() => {})
    api.get<{ data: Staff[] }>('/contracts/pt-staff', { params: { branch_id: contract.branch_id } }).then((r) => { if (alive) setPts(r.data.data) }).catch(() => {})
    return () => { alive = false }
  }, [contract.branch_id])

  const save = async () => {
    setBusy(true)
    setErr('')
    try {
      await api.patch(`/contracts/${contract.id}/staff`, { sale_user_id: saleId || null, pt_user_id: ptId || null })
      toast('Đã cập nhật Sale và PT phụ trách')
      onDone()
    } catch (e) {
      setErr(apiError(e).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Đổi Sale, PT - ${contract.code}`}
      onClose={onClose}
      footer={<><Button onClick={onClose} disabled={busy}>Hủy</Button><Button variant="primary" onClick={save} disabled={busy || (needPt && !ptId)}>{busy ? 'Đang lưu...' : 'Lưu'}</Button></>}
    >
      {err && <div className="form-error" role="alert" style={{ marginBottom: 12 }}>{err}</div>}
      <Field label="Nhân viên Sale" htmlFor="sm-sale">
        <Select id="sm-sale" value={saleId} onChange={(e) => setSaleId(e.target.value)}>
          <option value="">Chưa gán</option>
          {sales.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </Field>
      <Field label={needPt ? 'PT phụ trách (bắt buộc)' : 'PT phụ trách'} htmlFor="sm-pt">
        <Select id="sm-pt" value={ptId} onChange={(e) => setPtId(e.target.value)}>
          <option value="">{needPt ? 'Chọn PT phụ trách' : 'Chưa gán'}</option>
          {pts.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </Field>
    </Modal>
  )
}
