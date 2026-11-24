import { useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtMoney } from '../lib/format'
import { DAY_TICKET_METHODS, DAY_TICKET_PRICE, canSellDayTicket, saleBody } from '../lib/dayTickets'
import { useAuth } from '../context/AuthContext'
import { useBranch } from '../context/BranchContext'
import { useToast } from './Toast'
import { Button, Field, Input, Panel, Select } from './ui'
import type { DayTicketMethod } from '../types'

export function DayTicketSale({ onSold, price = DAY_TICKET_PRICE }: { onSold?: () => void; price?: number }) {
  const { user } = useAuth()
  const { branchId } = useBranch()
  const toast = useToast()
  const branches = user?.branches ?? []
  const [f, setF] = useState<{ name: string; phone: string; method: DayTicketMethod; branch: string }>({ name: '', phone: '', method: 'cash', branch: '' })
  const [formErr, setFormErr] = useState('')
  const [busy, setBusy] = useState(false)
  const sellBranch = branchId ?? (f.branch || (branches.length === 1 ? branches[0].id : ''))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSellDayTicket(f) || !sellBranch) return
    setBusy(true)
    setFormErr('')
    try {
      await api.post('/day-tickets', saleBody(f, sellBranch))
      toast(`Đã bán vé lẻ cho ${f.name.trim()}`)
      setF((x) => ({ ...x, name: '', phone: '' }))
      onSold?.()
    } catch (err) {
      setFormErr(apiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="Bán vé lẻ" note={`${fmtMoney(price)} một vé`}>
      <form className="form-grid" onSubmit={submit} aria-label="Bán vé lẻ">
        <Field label="Họ và tên" htmlFor="dt-name" full>
          <Input id="dt-name" required value={f.name} maxLength={100} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} />
        </Field>
        <Field label="4 số cuối SĐT" htmlFor="dt-phone" error={f.phone && !canSellDayTicket({ name: 'x', phone: f.phone }) ? 'Nhập đủ 4 chữ số' : undefined}>
          <Input id="dt-phone" required inputMode="numeric" maxLength={4} pattern="\d{4}" value={f.phone} onChange={(e) => setF((x) => ({ ...x, phone: e.target.value.replace(/\D/g, '') }))} />
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
        {formErr && <div className="form-error" role="alert" style={{ gridColumn: '1 / -1' }}>{formErr}</div>}
        <div className="field full">
          <Button variant="primary" type="submit" disabled={busy || !canSellDayTicket(f) || !sellBranch}>{busy ? 'Đang xử lý...' : `Thu ${fmtMoney(price)} và bán vé`}</Button>
        </div>
      </form>
    </Panel>
  )
}
