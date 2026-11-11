import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { METHODS, METHOD_LABEL, diffTone, fmtDateTime, fmtMoney, parseMoney } from '../lib/format'
import { useShift } from '../context/ShiftContext'
import { usePermission } from '../context/usePermission'
import { Button, Chip, DataTable, Field, Input, Kpi, KpiRow, PageHeader, Panel, useToast, type Column } from '../components/ui'
import type { ListResp, Payment, ShiftClose } from '../types'

export default function ShiftPage() {
  const { shift, loaded, refresh, openModal } = useShift()
  const { can } = usePermission()
  const toast = useToast()
  const [counted, setCounted] = useState('')
  const [result, setResult] = useState<ShiftClose | null>(null)
  const [closedAt, setClosedAt] = useState<string | null>(null)
  const [cashIn, setCashIn] = useState(0)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!shift) return
    api.get<ListResp<Payment>>('/payments', { params: { shift_id: shift.id, status: 'confirmed', method: 'cash', limit: 100 } })
      .then((r) => setCashIn(r.data.data.reduce((s, p) => s + p.amount, 0)))
      .catch(() => setCashIn(0))
  }, [shift])

  if (!loaded) return <div className="loading">Đang tải...</div>

  const close = async (e: FormEvent) => {
    e.preventDefault()
    if (!shift) return
    setBusy(true)
    setErr('')
    try {
      const { data } = await api.post(`/shifts/${shift.id}/close`, { counted_cash: parseMoney(counted) })
      setResult(data.data)
      setClosedAt(new Date().toISOString())
      toast('Đã đóng ca')
      refresh()
    } catch (x) {
      setErr(apiError(x).message)
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    const tone = diffTone(result.difference)
    const rows = METHODS.map((m) => ({ m, v: result.totals_by_method[m] ?? 0 }))
    const cols: Column<{ m: string; v: number }>[] = [
      { key: 'm', header: 'Hình thức', render: (r) => METHOD_LABEL[r.m as keyof typeof METHOD_LABEL] },
      { key: 'v', header: 'Số tiền', numeric: true, render: (r) => fmtMoney(r.v) },
    ]
    return (
      <>
        <PageHeader title="Kết quả đóng ca" sub={<Chip>Đã đóng, chỉ xem</Chip>} />
        <KpiRow>
          <Kpi value={fmtMoney(result.expected_cash)} label="Tiền mặt dự kiến" />
          <Kpi value={fmtMoney(result.counted_cash)} label="Tiền mặt đếm được" />
          <Kpi value={<Chip tone={tone}>{fmtMoney(result.difference)}</Chip>} label="Chênh lệch" />
          <Kpi value={fmtDateTime(closedAt)} label="Đóng lúc" />
        </KpiRow>
        <Panel title="Tổng theo hình thức" flush>
          <DataTable columns={cols} rows={rows} rowKey={(r) => r.m} pageSize={25} pageSizes={[25]} itemLabel="dòng" />
        </Panel>
      </>
    )
  }

  if (!shift) {
    return (
      <>
        <PageHeader title="Ca thu ngân" />
        <Panel title="Chưa có ca đang mở">
          <p style={{ margin: '0 0 12px' }}>Bạn chưa mở ca. Cần mở ca để thu tiền mặt.</p>
          {can('shifts.open') ? <Button variant="primary" onClick={openModal}>Mở ca</Button> : <span className="hint-muted">Nhờ người có quyền mở ca.</span>}
        </Panel>
      </>
    )
  }

  const expected = shift.opening_cash + cashIn
  const diff = parseMoney(counted) - expected
  return (
    <>
      <PageHeader title="Đóng ca" sub={`Mở lúc ${fmtDateTime(shift.opened_at)}`} />
      <KpiRow>
        <Kpi value={fmtMoney(shift.opening_cash)} label="Tiền đầu ca" />
        <Kpi value={fmtMoney(cashIn)} label="Thu tiền mặt trong ca" />
        <Kpi value={fmtMoney(expected)} label="Tiền mặt dự kiến" />
        <Kpi value={counted === '' ? '-' : <Chip tone={diffTone(diff)}>{fmtMoney(diff)}</Chip>} label="Chênh lệch" />
      </KpiRow>
      <Panel title="Kiểm đếm tiền mặt">
        {can('shifts.close') ? (
          <form className="stack narrow" onSubmit={close}>
            {err && <div className="form-error" role="alert">{err}</div>}
            <Field label="Tiền mặt đếm được (đồng)" htmlFor="sc-cash">
              <Input id="sc-cash" inputMode="numeric" required value={counted} onChange={(e) => setCounted(e.target.value)} />
            </Field>
            <div><Button variant="primary" type="submit" disabled={busy || counted === ''}>{busy ? 'Đang đóng...' : 'Đóng ca'}</Button></div>
          </form>
        ) : (
          <span className="hint-muted">Bạn không có quyền đóng ca.</span>
        )}
      </Panel>
    </>
  )
}
