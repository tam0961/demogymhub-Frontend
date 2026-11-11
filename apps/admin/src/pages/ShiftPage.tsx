import { Fragment, useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { METHODS, METHOD_LABEL, diffTone, fmtDateTime, fmtMoney, parseMoney } from '../lib/format'
import { useShift } from '../context/ShiftContext'
import { usePermission } from '../context/usePermission'
import { useToast } from '../components/Toast'
import { Badge, Button, Field, Input } from '../components/ui'
import type { Payment, ListResp, ShiftClose } from '../types'

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
    api.get<ListResp<Payment>>('/payments', { params: { shift_id: shift.id, status: 'confirmed', method: 'cash', limit: 200 } })
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
    return (
      <>
        <div className="page-head"><h1>Kết quả đóng ca</h1><Badge>Đã đóng - chỉ xem</Badge></div>
        <section className="card pad stack">
          <dl className="kv">
            <dt>Đóng lúc</dt><dd>{fmtDateTime(closedAt)}</dd>
            <dt>Tiền mặt dự kiến</dt><dd className="num">{fmtMoney(result.expected_cash)}</dd>
            <dt>Tiền mặt đếm được</dt><dd className="num">{fmtMoney(result.counted_cash)}</dd>
            <dt>Chênh lệch</dt><dd className="num"><Badge tone={tone}>{fmtMoney(result.difference)}</Badge></dd>
          </dl>
          <h2 className="sec">Tổng theo phương thức</h2>
          <dl className="kv">
            {METHODS.map((m) => (<Fragment key={m}><dt>{METHOD_LABEL[m]}</dt><dd className="num">{fmtMoney(result.totals_by_method[m] ?? 0)}</dd></Fragment>))}
          </dl>
        </section>
      </>
    )
  }

  if (!shift) {
    return (
      <>
        <div className="page-head"><h1>Ca thu ngân</h1></div>
        <section className="card pad stack">
          <p style={{ margin: 0 }}>Bạn chưa mở ca. Cần mở ca để thu tiền mặt.</p>
          {can('shifts.open') && <div><Button variant="primary" onClick={openModal}>Mở ca</Button></div>}
        </section>
      </>
    )
  }

  const expected = shift.opening_cash + cashIn
  const diff = parseMoney(counted) - expected
  return (
    <>
      <div className="page-head"><h1>Đóng ca</h1></div>
      <form className="card pad stack" onSubmit={close}>
        {err && <div className="form-error" role="alert">{err}</div>}
        <dl className="kv">
          <dt>Mở lúc</dt><dd>{fmtDateTime(shift.opened_at)}</dd>
          <dt>Tiền đầu ca</dt><dd className="num">{fmtMoney(shift.opening_cash)}</dd>
          <dt>Thu tiền mặt trong ca</dt><dd className="num">{fmtMoney(cashIn)}</dd>
          <dt>Tiền mặt dự kiến</dt><dd className="num"><b>{fmtMoney(expected)}</b></dd>
        </dl>
        {can('shifts.close') ? (
          <>
            <Field label="Tiền mặt đếm được (đ)" htmlFor="sc-cash">
              <Input id="sc-cash" inputMode="numeric" required value={counted} onChange={(e) => setCounted(e.target.value)} />
            </Field>
            {counted !== '' && <div>Chênh lệch: <Badge tone={diffTone(diff)}>{fmtMoney(diff)}</Badge></div>}
            <div><Button variant="primary" type="submit" disabled={busy || counted === ''}>{busy ? 'Đang đóng...' : 'Đóng ca'}</Button></div>
          </>
        ) : (
          <span className="hint-muted">Bạn không có quyền đóng ca.</span>
        )}
      </form>
    </>
  )
}
