import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtMoney, fmtTime, parseMoney } from '../lib/format'
import { Modal } from '../components/Modal'
import { useToast } from '../components/Toast'
import { Button, Field, Input } from '../components/ui'
import type { Shift } from '../types'

interface ShiftValue {
  shift: Shift | null
  loaded: boolean
  refresh: () => Promise<void>
  openModal: () => void
}
const ShiftContext = createContext<ShiftValue>({ shift: null, loaded: false, refresh: async () => {}, openModal: () => {} })
export const useShift = () => useContext(ShiftContext)

export function ShiftProvider({ children, canOpen }: { children: ReactNode; canOpen: boolean }) {
  const [shift, setShift] = useState<Shift | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [modal, setModal] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/shifts/current')
      setShift((data.data as Shift | null) ?? null)
    } catch {
      setShift(null)
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const value = useMemo(() => ({ shift, loaded, refresh, openModal: () => canOpen && setModal(true) }), [shift, loaded, refresh, canOpen])
  return (
    <ShiftContext.Provider value={value}>
      {children}
      {modal && <OpenShiftModal onClose={() => setModal(false)} onOpened={() => { setModal(false); refresh() }} />}
    </ShiftContext.Provider>
  )
}

function OpenShiftModal({ onClose, onOpened }: { onClose: () => void; onOpened: () => void }) {
  const toast = useToast()
  const [cash, setCash] = useState('0')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try {
      await api.post('/shifts/open', { opening_cash: parseMoney(cash) })
      toast('Đã mở ca')
      onOpened()
    } catch (x) {
      setErr(apiError(x).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      title="Mở ca thu ngân"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Hủy</Button>
          <Button variant="primary" type="submit" form="open-shift" disabled={busy}>{busy ? 'Đang mở...' : 'Mở ca'}</Button>
        </>
      }
    >
      <form id="open-shift" className="stack" onSubmit={submit}>
        {err && <div className="form-error" role="alert">{err}</div>}
        <Field label="Tiền mặt đầu ca (đ)" htmlFor="os-cash">
          <Input id="os-cash" inputMode="numeric" required value={cash} onChange={(e) => setCash(e.target.value)} autoFocus />
        </Field>
        <span className="hint-muted">Đang nhập: {fmtMoney(parseMoney(cash))}</span>
      </form>
    </Modal>
  )
}

export const shiftLabel = (s: Shift) => `Ca mở lúc ${fmtTime(s.opened_at)}`
