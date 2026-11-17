import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { useBranch } from '../context/BranchContext'
import { useAuth } from '../context/AuthContext'
import { Modal } from './Modal'
import { Button, Field, Input, Select, Textarea } from './ui'
import type { Contract, ListResp, Member, PtSession } from '../types'

interface Trainer { id: string; name: string }
const VN = 7 * 3600000
const vnDate = (iso: string) => new Date(new Date(iso).getTime() + VN).toISOString().slice(0, 10)
const vnTime = (iso: string) => new Date(new Date(iso).getTime() + VN).toISOString().slice(11, 16)

export function PtBookModal({ day, trainers, assign, edit, initial, onClose, onSaved }: { day: string; trainers: Trainer[]; assign?: PtSession; edit?: PtSession; initial?: { trainerId?: string; date?: string; time?: string }; onClose: () => void; onSaved: () => void }) {
  const { branchId } = useBranch()
  const { user } = useAuth()
  const [q, setQ] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [memberId, setMemberId] = useState(edit?.member?.id ?? '')
  const [contracts, setContracts] = useState<Contract[]>([])
  const [contractId, setContractId] = useState('')
  const [trainerId, setTrainerId] = useState(edit?.trainer.id ?? initial?.trainerId ?? '')
  const [date, setDate] = useState(edit ? vnDate(edit.start_at) : initial?.date ?? day)
  const [time, setTime] = useState(edit ? vnTime(edit.start_at) : initial?.time ?? '09:00')
  const [duration, setDuration] = useState(edit ? String(Math.round((new Date(edit.end_at).getTime() - new Date(edit.start_at).getTime()) / 60000)) : '60')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const branch = branchId ?? (user?.branches.length === 1 ? user.branches[0].id : '')

  useEffect(() => {
    if (q.trim().length < 2) { setMembers([]); return }
    const t = setTimeout(() => {
      api.get<ListResp<Member>>('/members', { params: { q: q.trim(), branch_id: branch || undefined, limit: 10 } }).then((r) => setMembers(r.data.data)).catch(() => setMembers([]))
    }, 250)
    return () => clearTimeout(t)
  }, [q, branch])

  useEffect(() => {
    setContractId('')
    setContracts([])
    if (!memberId) return
    api.get<ListResp<Contract>>('/contracts', { params: { member_id: memberId, status: 'active', limit: 50 } })
      .then((r) => {
        setContracts(r.data.data.filter((c) => (c.package.category === 'pt_1on1' || c.package.category === 'pt_1on2') && c.sessions_total != null && ((c.sessions_left ?? 0) > 0 || c.id === edit?.contract_id)))
        if (edit?.contract_id && memberId === edit.member?.id) setContractId(edit.contract_id)
      })
      .catch(() => setContracts([]))
  }, [memberId, edit])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (edit) {
        await api.patch(`/pt/sessions/${edit.id}`, { trainer_id: trainerId, contract_id: contractId || null, start_at: `${date}T${time}:00+07:00`, duration_min: Number(duration) })
        onSaved()
        return
      }
      if (assign) {
        await api.post(`/pt/sessions/${assign.id}/assign`, { member_id: memberId, contract_id: contractId || null })
        onSaved()
        return
      }
      await api.post('/pt/sessions', {
        member_id: memberId || null,
        trainer_id: trainerId,
        contract_id: contractId || null,
        start_at: `${date}T${time}:00+07:00`,
        duration_min: Number(duration),
        note: note.trim() || null,
        branch_id: branch || undefined,
      })
      onSaved()
    } catch (err) {
      setError(apiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={edit ? 'Sửa lịch buổi PT' : assign ? 'Gán khách vào ca' : 'Đặt buổi PT 1:1'}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Hủy</Button><Button variant="primary" type="submit" form="pt-form" disabled={busy || (assign ? !memberId : !trainerId)}>{busy ? 'Đang lưu...' : edit ? 'Lưu thay đổi' : assign ? 'Gán khách' : 'Đặt buổi'}</Button></>}
    >
      <form id="pt-form" className="form-grid" onSubmit={submit}>
        {error && <div className="form-error full" role="alert">{error}</div>}
        {edit && <Field label="Hội viên" htmlFor="pt-member-name" full><Input id="pt-member-name" readOnly value={edit.member?.name ?? 'Chưa có khách'} /></Field>}
        {!edit && <Field label="Tìm hội viên (tên, SĐT, mã)" htmlFor="pt-q" full>
          <Input id="pt-q" value={q} onChange={(e) => { setQ(e.target.value); setMemberId('') }} />
        </Field>}
        {!edit && <Field label="Hội viên" htmlFor="pt-member" full>
          <Select id="pt-member" required={!!assign} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="" disabled>{members.length ? 'Chọn hội viên' : 'Nhập để tìm'}</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name} - {m.phone}</option>)}
          </Select>
        </Field>}
        <Field label="Hợp đồng PT (trừ buổi)" htmlFor="pt-contract" full>
          <Select id="pt-contract" value={contractId} onChange={(e) => setContractId(e.target.value)}>
            <option value="">Không gắn hợp đồng</option>
            {contracts.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.package.name} (còn {c.sessions_left} buổi)</option>)}
          </Select>
        </Field>
        {!assign && <Field label="PT" htmlFor="pt-trainer">
          <Select id="pt-trainer" required value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
            <option value="" disabled>Chọn PT</option>
            {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>}
        {!assign && <Field label="Ngày" htmlFor="pt-date"><Input id="pt-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>}
        {!assign && <Field label="Giờ bắt đầu" htmlFor="pt-time"><Input id="pt-time" type="time" required value={time} onChange={(e) => setTime(e.target.value)} /></Field>}
        {!assign && <Field label="Thời lượng (phút)" htmlFor="pt-dur"><Input id="pt-dur" type="number" min={15} max={240} step={15} required value={duration} onChange={(e) => setDuration(e.target.value)} /></Field>}
        {!edit && <Field label="Ghi chú" htmlFor="pt-note" full><Textarea id="pt-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
      </form>
    </Modal>
  )
}
