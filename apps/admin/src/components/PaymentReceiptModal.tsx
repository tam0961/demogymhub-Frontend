import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { paymentCode } from '../lib/contracts'
import { METHOD_LABEL, PAY_STATUS, fmtDateTime, fmtMoney } from '../lib/format'
import { Modal } from './Modal'
import { Button, Chip } from './ui'
import type { Contract, ListResp, Payment } from '../types'

export function PaymentReceiptModal({ payment, contract, onClose }: { payment: Payment; contract: Contract; onClose: () => void }) {
  const [staff, setStaff] = useState<string | null>(payment.created_by_name ?? null)

  useEffect(() => {
    if (staff) return
    let alive = true
    api.get<ListResp<Payment>>('/payments', { params: { contract_id: contract.id, limit: 100 } })
      .then((r) => { if (alive) setStaff(r.data.data.find((x) => x.id === payment.id)?.created_by_name ?? null) })
      .catch(() => {})
    return () => { alive = false }
  }, [staff, contract.id, payment.id])

  return (
    <Modal title={`Phiếu thu ${paymentCode(payment)}`} onClose={onClose} footer={<Button onClick={onClose}>Đóng</Button>}>
      <dl className="kv">
        <dt>Mã phiếu thu</dt><dd>{paymentCode(payment)}</dd>
        <dt>Thời gian</dt><dd>{fmtDateTime(payment.created_at)}</dd>
        <dt>Hội viên</dt><dd>{contract.member.name} ({contract.member.code})</dd>
        <dt>Hợp đồng</dt><dd>{contract.code}, {contract.package.name}</dd>
        <dt>Hình thức</dt><dd>{METHOD_LABEL[payment.method]}</dd>
        <dt>Số tiền</dt><dd><b>{fmtMoney(payment.amount)}</b></dd>
        <dt>Trạng thái</dt><dd><Chip tone={PAY_STATUS[payment.status].tone ?? 'neutral'}>{PAY_STATUS[payment.status].label}</Chip></dd>
        <dt>Nhân viên thu</dt><dd>{staff ?? <span className="hint-muted">-</span>}</dd>
        {payment.note && <><dt>Ghi chú</dt><dd>{payment.note}</dd></>}
      </dl>
    </Modal>
  )
}
