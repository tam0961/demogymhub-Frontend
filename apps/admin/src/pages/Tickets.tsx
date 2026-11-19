import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDateTime, fmtMoney } from '../lib/format'
import { TICKET_LABEL, TICKET_STATUS, feeText, type TicketStatus } from '../lib/tickets'
import { FormDialog } from '../components/Dialogs'
import { useToast } from '../components/Toast'
import { Button, Chip, DataTable, PageHeader, Panel, Segmented, type Column } from '../components/ui'
import type { ListResp, Ticket } from '../types'

const FILTERS: { value: TicketStatus | 'all'; label: string }[] = [
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'applied', label: 'Đã áp dụng' },
  { value: 'rejected', label: 'Đã từ chối' },
]

export default function Tickets() {
  const toast = useToast()
  const [status, setStatus] = useState<TicketStatus>('pending')
  const [rows, setRows] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [rejecting, setRejecting] = useState<Ticket | null>(null)
  const [busyId, setBusyId] = useState('')
  const [rejErr, setRejErr] = useState('')
  const [rejBusy, setRejBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get<ListResp<Ticket>>('/tickets', { params: { status, limit: 100 } })
      setRows(data.data)
    } catch (e) {
      setError(apiError(e).message)
    } finally {
      setLoading(false)
    }
  }, [status])
  useEffect(() => { load() }, [load])

  const approve = async (t: Ticket) => {
    setBusyId(t.id)
    try {
      await api.post(`/tickets/${t.id}/approve`)
      toast('Đã duyệt phiếu')
      await load()
    } catch (e) {
      toast(apiError(e).message, true)
    } finally {
      setBusyId('')
    }
  }

  const cols: Column<Ticket>[] = [
    { key: 'code', header: 'Hợp đồng', sortValue: (t) => t.contract_code, render: (t) => <Link to={`/contracts/${t.contract_id}`}>{t.contract_code}</Link> },
    { key: 'member', header: 'Hội viên', sortValue: (t) => t.member_name, render: (t) => <><div className="cell-main">{t.member_name}</div><div className="cell-sub">{t.member_code}</div></> },
    { key: 'type', header: 'Loại phiếu', sortValue: (t) => t.type, render: (t) => TICKET_LABEL[t.type] },
    { key: 'fee', header: 'Số tiền', numeric: true, sortValue: (t) => t.fee, render: (t) => <span className={t.fee < 0 ? 'text-bad' : ''} title={feeText(t.fee)}>{t.fee === 0 ? '-' : fmtMoney(t.fee)}</span> },
    { key: 'by', header: 'Người lập', render: (t) => <>{t.requested_by_name ?? '-'}{t.reason ? <div className="cell-sub">{t.reason}</div> : null}</> },
    { key: 'at', header: 'Thời gian', sortValue: (t) => t.created_at, render: (t) => fmtDateTime(t.created_at) },
    { key: 'status', header: 'Trạng thái', render: (t) => <Chip tone={TICKET_STATUS[t.status].tone}>{TICKET_STATUS[t.status].label}</Chip> },
    {
      key: 'act',
      header: '',
      className: 'actions',
      render: (t) => t.status === 'pending' ? (
        <>
          <Button small variant="primary" disabled={busyId === t.id} onClick={() => approve(t)}>Duyệt</Button>
          <Button small variant="danger" disabled={busyId === t.id} onClick={() => setRejecting(t)}>Từ chối</Button>
        </>
      ) : null,
    },
  ]

  return (
    <>
      <PageHeader title="Phiếu chờ duyệt" sub="Phiếu hạ cấp, hủy hợp đồng, chuyển nhượng do lễ tân lập cần chủ duyệt" />
      <Panel title="Danh sách phiếu" count={`${rows.length} phiếu`} flush>
        <div style={{ padding: '10px 14px' }}>
          <Segmented ariaLabel="Lọc theo trạng thái" options={FILTERS.map((f) => ({ value: f.value as TicketStatus, label: f.label }))} value={status} onChange={setStatus} />
        </div>
        <DataTable columns={cols} rows={rows} rowKey={(t) => t.id} defaultSort={{ key: 'at', dir: 'desc' }} loading={loading} error={error} emptyText="Không có phiếu" itemLabel="phiếu" />
      </Panel>
      {rejecting && (
        <FormDialog
          title="Từ chối phiếu"
          reasonLabel="Lý do từ chối"
          confirmLabel="Từ chối"
          danger
          error={rejErr}
          busy={rejBusy}
          onClose={() => { setRejecting(null); setRejErr('') }}
          onSubmit={async (reason) => {
            setRejBusy(true)
            setRejErr('')
            try {
              await api.post(`/tickets/${rejecting.id}/reject`, { reason })
              toast('Đã từ chối phiếu')
              setRejecting(null)
              await load()
            } catch (e) {
              setRejErr(apiError(e).message)
            } finally {
              setRejBusy(false)
            }
          }}
        />
      )}
    </>
  )
}
