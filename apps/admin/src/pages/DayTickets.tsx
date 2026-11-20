import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDateTime, fmtMoney, fmtTime, todayISO, METHOD_LABEL } from '../lib/format'
import { DAY_TICKET_METHODS, DAY_TICKET_PRICE, canSellDayTicket, saleBody } from '../lib/dayTickets'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { usePermission } from '../context/usePermission'
import { useToast } from '../components/Toast'
import { Button, Chip, DataTable, Field, Input, KpiRow, Kpi, PageHeader, Panel, Select, type Column } from '../components/ui'
import type { DayTicket, DayTicketList, DayTicketMethod } from '../types'

export default function DayTickets({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const { can } = usePermission()
  const toast = useToast()
  const branches = user?.branches ?? []
  const canSell = can('day_tickets.create')
  const [rows, setRows] = useState<DayTicket[]>([])
  const [meta, setMeta] = useState({ count: 0, total: 0, price: DAY_TICKET_PRICE })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [f, setF] = useState<{ name: string; phone: string; method: DayTicketMethod; branch: string }>({ name: '', phone: '', method: 'cash', branch: '' })
  const [formErr, setFormErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [outId, setOutId] = useState('')
  const sellBranch = branchId ?? (f.branch || (branches.length === 1 ? branches[0].id : ''))

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

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSellDayTicket(f) || !sellBranch) return
    setBusy(true)
    setFormErr('')
    try {
      await api.post('/day-tickets', saleBody(f, sellBranch))
      toast(`Đã bán vé lẻ cho ${f.name.trim()}`)
      setF((x) => ({ ...x, name: '', phone: '' }))
      await load()
    } catch (err) {
      setFormErr(apiError(err).message)
    } finally {
      setBusy(false)
    }
  }

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
      {canSell && (
        <Panel title="Bán vé lẻ">
          <form className="form-grid" onSubmit={submit} aria-label="Bán vé lẻ">
            <Field label="Họ và tên" htmlFor="dt-name">
              <Input id="dt-name" required value={f.name} maxLength={100} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} />
            </Field>
            <Field label="Số điện thoại" htmlFor="dt-phone" error={f.phone && !canSellDayTicket({ name: 'x', phone: f.phone }) ? 'Số điện thoại gồm 9 đến 15 chữ số' : undefined}>
              <Input id="dt-phone" required inputMode="tel" value={f.phone} onChange={(e) => setF((x) => ({ ...x, phone: e.target.value }))} />
            </Field>
            <Field label="Hình thức thu" htmlFor="dt-method">
              <Select id="dt-method" value={f.method} onChange={(e) => setF((x) => ({ ...x, method: e.target.value as DayTicketMethod }))}>
                {DAY_TICKET_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </Select>
            </Field>
            {!branchId && branches.length > 1 && (
              <Field label="Chi nhánh" htmlFor="dt-branch">
                <Select id="dt-branch" required value={f.branch} onChange={(e) => setF((x) => ({ ...x, branch: e.target.value }))}>
                  <option value="">Chọn chi nhánh</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </Field>
            )}
            {formErr && <div className="form-error" role="alert" style={{ gridColumn: "1 / -1" }}>{formErr}</div>}
            <div className="field full">
              <Button variant="primary" type="submit" disabled={busy || !canSellDayTicket(f) || !sellBranch}>{busy ? 'Đang xử lý...' : `Thu ${fmtMoney(meta.price)} và bán vé`}</Button>
            </div>
          </form>
        </Panel>
      )}
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
