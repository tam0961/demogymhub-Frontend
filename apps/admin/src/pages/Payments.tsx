import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchAll } from '../lib/fetchAll'
import { apiError } from '../lib/errors'
import { paymentCode } from '../lib/contracts'
import { METHODS, METHOD_LABEL, PAY_STATUS, downloadBlob, fmtDate, fmtMoney, toCSV } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import { useShift } from '../context/ShiftContext'
import { Modal } from '../components/Modal'
import { PendingPanel } from '../components/PayModal'
import { Button, Chip, DataTable, Icon, Kpi, KpiRow, PageHeader, Select, type Column } from '../components/ui'
import type { PayMethod, Payment } from '../types'

export function paymentsToCSV(rows: Payment[]) {
  return toCSV([
    ['Mã phiếu', 'Ngày', 'Hội viên', 'Hợp đồng', 'Hình thức', 'Trạng thái', 'Số tiền'],
    ...rows.map((p) => [paymentCode(p), fmtDate(p.created_at), p.contract?.member?.name ?? '', p.contract?.code ?? '', METHOD_LABEL[p.method], PAY_STATUS[p.status].label, p.amount]),
  ])
}

export default function Payments() {
  const { branchId } = useBranch()
  const { shift } = useShift()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [date, setDate] = useState('')
  const [method, setMethod] = useState('')
  const [status, setStatus] = useState('')
  const [shiftOnly, setShiftOnly] = useState(false)
  const [rows, setRows] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pending, setPending] = useState<Payment | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setRows(await fetchAll<Payment>('/payments', { date: date || undefined, method: method || undefined, status: status || undefined, shift_id: shiftOnly && shift ? shift.id : undefined, branch_id: branchId ?? undefined }))
    } catch (e) {
      setError(apiError(e).message)
    } finally {
      setLoading(false)
    }
  }, [date, method, status, shiftOnly, shift, branchId])
  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase()
    if (!k) return rows
    return rows.filter((p) => paymentCode(p).toLowerCase().includes(k) || (p.contract?.code ?? '').toLowerCase().includes(k) || (p.contract?.member?.name ?? '').toLowerCase().includes(k))
  }, [rows, q])

  const confirmed = filtered.filter((p) => p.status === 'confirmed')
  const sum = (l: Payment[]) => l.reduce((s, p) => s + p.amount, 0)
  const byMethod = (m: PayMethod) => sum(confirmed.filter((p) => p.method === m))
  const pendingSum = sum(filtered.filter((p) => p.status === 'pending'))

  const columns: Column<Payment>[] = [
    { key: 'code', header: 'Mã phiếu thu', sortValue: (p) => paymentCode(p), render: (p) => <span className="cell-main">{paymentCode(p)}</span> },
    { key: 'at', header: 'Ngày', sortValue: (p) => p.created_at, render: (p) => fmtDate(p.created_at) },
    { key: 'member', header: 'Hội viên', sortValue: (p) => p.contract?.member?.name, render: (p) => (p.contract?.member ? <div className="cell-main">{p.contract.member.name}</div> : <span className="hint-muted">Khách lẻ</span>) },
    { key: 'contract', header: 'Hợp đồng', sortValue: (p) => p.contract?.code, render: (p) => p.contract?.code ?? p.contract_id },
    { key: 'method', header: 'Hình thức', sortValue: (p) => METHOD_LABEL[p.method], render: (p) => METHOD_LABEL[p.method] },
    { key: 'amount', header: 'Số tiền', numeric: true, sortValue: (p) => p.amount, render: (p) => <span className="cell-main">{fmtMoney(p.amount)}</span> },
    {
      key: 'status', header: 'Trạng thái', sortValue: (p) => p.status,
      render: (p) => (
        <span className="row-tools">
          <Chip tone={PAY_STATUS[p.status].tone ?? 'neutral'}>{PAY_STATUS[p.status].label}</Chip>
          {p.status === 'pending' && <Button small onClick={() => setPending(p)}>{p.method === 'vietqr' ? 'Xem QR' : 'Xác nhận'}</Button>}
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Phiếu thu" sub="Mọi khoản thanh toán, bấm dòng để mở hợp đồng" />
      <div className="toolbar">
        <input className="input" type="search" placeholder="Tìm mã phiếu, tên, mã hợp đồng" aria-label="Tìm phiếu thu" value={q} onChange={(e) => setQ(e.target.value)} />
        <input className="input" type="date" aria-label="Ngày" value={date} onChange={(e) => setDate(e.target.value)} />
        <Select aria-label="Hình thức" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="">Mọi hình thức</option>
          {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
        </Select>
        <Select aria-label="Trạng thái" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Mọi trạng thái</option>
          {Object.entries(PAY_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <Select aria-label="Ca" value={shiftOnly ? 'cur' : ''} onChange={(e) => setShiftOnly(e.target.value === 'cur')}>
          <option value="">Tất cả ca</option>
          <option value="cur" disabled={!shift}>Ca hiện tại</option>
        </Select>
        <div className="grow">
          <Button onClick={() => downloadBlob(new Blob(['﻿' + paymentsToCSV(filtered)], { type: 'text/csv;charset=utf-8' }), 'phieu-thu.csv')} disabled={filtered.length === 0}><Icon name="download" size={16} />Xuất CSV</Button>
        </div>
      </div>
      <KpiRow>
        <Kpi value={filtered.length} label="Số phiếu" />
        <Kpi value={fmtMoney(sum(confirmed))} label="Thực thu" />
        <Kpi value={fmtMoney(pendingSum)} label="Chờ xác nhận" />
        <Kpi value={fmtMoney(byMethod('cash'))} label="Tiền mặt" />
        <Kpi value={fmtMoney(byMethod('transfer'))} label="Chuyển khoản" />
        <Kpi value={fmtMoney(byMethod('vietqr'))} label="VietQR" />
        <Kpi value={fmtMoney(byMethod('ewallet'))} label="Ví điện tử" />
      </KpiRow>
      <div className="card">
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(p) => p.id}
          onRowClick={(p) => nav(`/contracts/${p.contract_id}`)}
          loading={loading}
          error={error}
          emptyText="Không có giao dịch"
          itemLabel="phiếu"
        />
        <div className="totals-row"><span>Tổng thực thu ({confirmed.length} phiếu)</span><b className="num">{fmtMoney(sum(confirmed))}</b></div>
      </div>
      {pending && (
        <Modal title="Giao dịch chờ xác nhận" onClose={() => { setPending(null); load() }} footer={<Button onClick={() => { setPending(null); load() }}>Đóng</Button>}>
          <PendingPanel payment={pending} onConfirmed={load} />
        </Modal>
      )}
    </>
  )
}
