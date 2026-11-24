import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDateTime, fmtMoney, fmtTime, todayISO, METHOD_LABEL } from '../lib/format'
import { DAY_TICKET_PRICE } from '../lib/dayTickets'
import { useBranch } from '../context/BranchContext'
import { usePermission } from '../context/usePermission'
import { useToast } from '../components/Toast'
import { DayTicketSale } from '../components/DayTicketSale'
import { Button, Chip, DataTable, KpiRow, Kpi, PageHeader, Panel, type Column } from '../components/ui'
import type { DayTicket, DayTicketList } from '../types'

export default function DayTickets({ embedded = false }: { embedded?: boolean }) {
  const { branchId } = useBranch()
  const { can } = usePermission()
  const toast = useToast()
  const canSell = can('day_tickets.create')
  const [rows, setRows] = useState<DayTicket[]>([])
  const [meta, setMeta] = useState({ count: 0, total: 0, price: DAY_TICKET_PRICE })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [outId, setOutId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get<DayTicketList>('/day-tickets', { params: { date: todayISO(), branch_id: branchId ?? undefined } })
      setRows(data.data)
      setMeta(data.meta)
    } catch (e) {
      setError(apiError(e).message)
    } finally {
      setLoading(false)
    }
  }, [branchId])
  useEffect(() => { load() }, [load])

  const checkout = async (t: DayTicket) => {
    setOutId(t.id)
    try {
      await api.post(`/day-tickets/${t.id}/checkout`)
      toast(`${t.name} đã ra về`)
      await load()
    } catch (err) {
      toast(apiError(err).message, true)
    } finally {
      setOutId('')
    }
  }

  const cols: Column<DayTicket>[] = [
    { key: 'name', header: 'Khách', sortValue: (t) => t.name, render: (t) => <><div className="cell-main">{t.name}</div><div className="cell-sub">{t.phone}</div></> },
    { key: 'at', header: 'Giờ bán', sortValue: (t) => t.created_at, render: (t) => <span title={fmtDateTime(t.created_at)}>{fmtTime(t.created_at)}</span> },
    { key: 'method', header: 'Hình thức', render: (t) => METHOD_LABEL[t.method] ?? t.method },
    { key: 'amount', header: 'Số tiền', numeric: true, sortValue: (t) => t.amount, render: (t) => fmtMoney(t.amount) },
    { key: 'by', header: 'Người thu', render: (t) => t.created_by_name ?? '-' },
    { key: 'state', header: 'Trạng thái', render: (t) => (t.checked_out_at ? <Chip>{`Đã ra về ${fmtTime(t.checked_out_at)}`}</Chip> : <Chip tone="ok">Đang tập</Chip>) },
    { key: 'act', header: '', className: 'actions', render: (t) => (canSell && !t.checked_out_at ? <Button small disabled={outId === t.id} onClick={() => checkout(t)}>Ra về</Button> : null) },
  ]

  return (
    <>
      {embedded ? <h2 className="sec">{`Vé lẻ - ${fmtMoney(meta.price)} một vé, không cần hợp đồng`}</h2> : <PageHeader title="Vé lẻ" sub={`Vé tập 1 ngày, ${fmtMoney(meta.price)} một vé, không cần hợp đồng`} />}
      {canSell && !embedded && <DayTicketSale onSold={load} price={meta.price} />}
      <KpiRow>
        <Kpi value={String(meta.count)} label="Vé bán hôm nay" />
        <Kpi value={fmtMoney(meta.total)} label="Tổng thu vé lẻ" />
      </KpiRow>
      <Panel title="Vé bán hôm nay" count={`${rows.length} vé`} flush>
        <DataTable columns={cols} rows={rows} rowKey={(t) => t.id} defaultSort={{ key: 'at', dir: 'desc' }} loading={loading} error={error} emptyText="Chưa bán vé nào hôm nay" itemLabel="vé" />
      </Panel>
    </>
  )
}
