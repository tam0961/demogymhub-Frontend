import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api'
import { paymentCode } from '../lib/contracts'
import { METHOD_LABEL, PAY_STATUS, fmtDateTime, fmtMoney } from '../lib/format'
import { receiptValues, renderDocHtml } from '../lib/printDoc'
import { Modal } from './Modal'
import { Button, Chip } from './ui'
import type { Contract, ListResp, Payment } from '../types'

interface Tpl { key: string; title: string; body: string }
const FALLBACK: Tpl = { key: 'receipt', title: 'PHIẾU THU', body: 'TH GYM & FITNESS - {{chi_nhanh}}\n\nMã phiếu thu: {{ma_phieu_thu}}      Ngày thu: {{ngay_thu}}\nHội viên: {{ten_hoi_vien}} (Mã: {{ma_hoi_vien}})\nHợp đồng: {{ma_hop_dong}} - {{goi_tap}}\nSố tiền thu: {{so_tien}}\nHình thức: {{hinh_thuc}}\n\nNhân viên thu: {{nhan_vien_thu}}' }

export function PaymentReceiptModal({ payment, contract, onClose }: { payment: Payment; contract: Contract; onClose: () => void }) {
  const [staff, setStaff] = useState<string | null>(payment.created_by_name ?? null)
  const [tpl, setTpl] = useState<Tpl>(FALLBACK)
  const frame = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    let alive = true
    api.get<ListResp<Payment>>('/payments', { params: { contract_id: contract.id, limit: 100 } })
      .then((r) => { if (alive && !staff) setStaff(r.data.data.find((x) => x.id === payment.id)?.created_by_name ?? null) })
      .catch(() => {})
    api.get<{ data: Tpl[] }>('/settings/print-templates')
      .then((r) => { const t = r.data.data.find((x) => x.key === 'receipt'); if (alive && t) setTpl(t) })
      .catch(() => {})
    return () => { alive = false }
  }, [contract.id, payment.id, staff])

  const html = useMemo(() => renderDocHtml(tpl.title, tpl.body, receiptValues(contract, payment, staff), false), [tpl, contract, payment, staff])
  const print = () => { const w = frame.current?.contentWindow; if (w) { w.focus(); w.print() } }

  return (
    <Modal title={`Phiếu thu ${paymentCode(payment)}`} size="receipt" onClose={onClose} footer={<><Button onClick={onClose}>Đóng</Button><Button variant="primary" onClick={print}>In phiếu thu</Button></>}>
      <div className="receipt-grid">
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
        <iframe ref={frame} className="receipt-frame" title="Mẫu phiếu thu" srcDoc={html} />
      </div>
    </Modal>
  )
}
