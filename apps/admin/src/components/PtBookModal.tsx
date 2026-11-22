import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { useBranch } from '../context/BranchContext'
import { useAuth } from '../context/AuthContext'
import { Modal } from './Modal'
import { BranchTag, Button, Chip, Field, Input, Segmented, Select, Textarea } from './ui'
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

interface TrainerB { id: string; name: string; branches?: { id: string; name: string }[] }

export function PtAddModal({ day, trainers, initial, onClose, onSaved }: { day: string; trainers: TrainerB[]; initial?: { trainerId?: string; date?: string; time?: string }; onClose: () => void; onSaved: () => void }) {
  const { branchId } = useBranch()
  const [trainerId, setTrainerId] = useState(initial?.trainerId ?? '')
  const [date, setDate] = useState(initial?.date ?? day)
  const [hour, setHour] = useState((initial?.time ?? '09:00').slice(0, 2))
  const [minute, setMinute] = useState((initial?.time ?? '09:00').slice(3, 5))
  const [kind, setKind] = useState<'pt_1on1' | 'pt_1on2'>('pt_1on1')
  const [contracts, setContracts] = useState<Contract[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const trainer = trainers.find((t) => t.id === trainerId)
  const trainerBranch = trainer?.branches?.length === 1 ? trainer.branches[0].id : branchId ?? undefined
  const max = kind === 'pt_1on1' ? 1 : 2

  useEffect(() => {
    setPicked([])
    setContracts([])
    if (!trainerId) return
    api.get<ListResp<Contract>>('/contracts', { params: { category: kind, status: 'active', limit: 100, branch_id: trainerBranch, pt_user_id: trainerId } })
      .then((r) => setContracts(r.data.data.filter((c) => c.sessions_total != null && (c.sessions_left ?? 0) > 0 && c.pt?.id === trainerId)))
      .catch(() => setContracts([]))
  }, [trainerId, kind, trainerBranch])

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < max ? [...p, id] : p))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (picked.length !== max) {
        setError(kind === 'pt_1on1' ? 'Chọn 1 hội viên của PT này' : 'Buổi 1-2 phải chọn đủ 2 hội viên của PT này')
        setBusy(false)
        return
      }
      const [a, b] = picked.map((id) => contracts.find((c) => c.id === id)!)
      await api.post('/pt/sessions', {
        member_id: a.member_id,
        contract_id: a.id,
        ...(b ? { partner: { member_id: b.member_id, contract_id: b.id } } : {}),
        trainer_id: trainerId,
        start_at: `${date}T${hour}:${minute}:00+07:00`,
        duration_min: 60,
        branch_id: trainerBranch,
      })
      onSaved()
    } catch (err) {
      setError(apiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Thêm buổi PT" onClose={onClose} footer={<><Button onClick={onClose}>Hủy</Button><Button variant="primary" type="submit" form="pt-add-form" disabled={busy || !trainerId || picked.length !== max}>{busy ? 'Đang lưu...' : 'Tạo buổi PT'}</Button></>}>
      <form id="pt-add-form" className="form-grid" onSubmit={submit}>
        {error && <div className="form-error full" role="alert">{error}</div>}
        <Field label="Huấn luyện viên" htmlFor="pa-trainer" full>
          <Select id="pa-trainer" required value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
            <option value="" disabled>Chọn PT</option>
            {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Ngày" htmlFor="pa-date"><Input id="pa-date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Giờ bắt đầu" htmlFor="pa-hour">
          <span style={{ display: 'flex', gap: 8 }}>
            <Select id="pa-hour" aria-label="Giờ" value={hour} onChange={(e) => setHour(e.target.value)}>
              {Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')).map((h) => <option key={h} value={h}>{h} giờ</option>)}
            </Select>
            <Select aria-label="Phút" value={minute} onChange={(e) => setMinute(e.target.value)}>
              {['00', '15', '30', '45'].map((m) => <option key={m} value={m}>{m} phút</option>)}
            </Select>
          </span>
        </Field>
        <Field label="Loại buổi" htmlFor="pa-kind" full>
          <Segmented<'pt_1on1' | 'pt_1on2'> fill ariaLabel="Loại buổi" value={kind} options={[{ value: 'pt_1on1', label: '1-1' }, { value: 'pt_1on2', label: '1-2' }]} onChange={setKind} />
        </Field>
        <Field label={kind === 'pt_1on1' ? 'Hội viên của PT (chọn 1)' : 'Hội viên của PT (chọn đủ 2)'} htmlFor="pa-members" full hint={`Chỉ hiện hội viên đang gắn với PT này. ${kind === 'pt_1on1' ? 'Buổi 1-1 chọn 1 hội viên.' : 'Buổi 1-2 bắt buộc chọn đủ 2 hội viên.'} Mỗi hội viên trừ buổi từ gói PT riêng của mình khi buổi hoàn thành.`}>
          <div id="pa-members" className="ptm-list" role="group">
            {!trainerId && <div className="cell-sub">Chọn huấn luyện viên để xem danh sách hội viên</div>}
            {trainerId && contracts.length === 0 && <div className="cell-sub">PT này chưa có hội viên còn buổi {kind === 'pt_1on1' ? 'gói PT 1:1' : 'gói PT 1:2'}</div>}
            {contracts.map((c) => (
              <label key={c.id} className="ptm-row">
                <input type="checkbox" checked={picked.includes(c.id)} disabled={!picked.includes(c.id) && picked.length >= max} onChange={() => toggle(c.id)} />
                <span>{c.member.name}</span>
                <span className="cell-sub">còn {c.sessions_left} buổi</span>
              </label>
            ))}
          </div>
        </Field>
      </form>
    </Modal>
  )
}

const dmy = (iso: string) => { const d = vnDate(iso); return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` }

export function PtFreeSlotModal({ session, onClose, onAssigned, onComplete, onNoShow }: { session: PtSession; onClose: () => void; onAssigned: () => void; onComplete: (s: PtSession) => void; onNoShow: (s: PtSession) => void }) {
  const [chosen, setChosen] = useState<PtSession | null>(null)
  const { user } = useAuth()
  const [contracts, setContracts] = useState<Contract[]>([])
  const [contractId, setContractId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const branch = user?.branches.find((b) => b.id === session.branch_id)

  useEffect(() => {
    api.get<ListResp<Contract>>('/contracts', { params: { category: 'pt_1on1', status: 'active', limit: 100, branch_id: session.branch_id } })
      .then((r) => setContracts(r.data.data.filter((c) => c.sessions_total != null && (c.sessions_left ?? 0) > 0)))
      .catch(() => setContracts([]))
  }, [session.branch_id])

  const assign = async () => {
    const c = contracts.find((x) => x.id === contractId)
    if (!c) return
    setBusy(true)
    setError('')
    try {
      await api.post(`/pt/sessions/${session.id}/assign`, { member_id: c.member_id, contract_id: c.id })
      setChosen({ ...session, member: c.member, contract_id: c.id, contract_code: c.code, sessions_left: c.sessions_left })
      onAssigned()
    } catch (err) {
      setError(apiError(err).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Buổi PT ${vnTime(session.start_at)}`}
      onClose={onClose}
      footer={<><Button disabled={!chosen} title={chosen ? undefined : 'Chọn khách trước'} onClick={() => chosen && onNoShow(chosen)}>Vắng mặt</Button><Button variant="primary" disabled={!chosen} title={chosen ? undefined : 'Chọn khách trước'} onClick={() => chosen && onComplete(chosen)}>Hoàn thành buổi</Button></>}
    >
      <dl className="kv">
        <dt>Huấn luyện viên</dt><dd>{session.trainer.name} {branch && <BranchTag branch={branch} />}</dd>
        <dt>Ngày</dt><dd>{dmy(session.start_at)}</dd>
        <dt>Loại</dt><dd>1-1</dd>
        <dt>Trạng thái</dt><dd><Chip tone="neutral">Đã đặt</Chip></dd>
      </dl>
      <h3 style={{ margin: '16px 0 8px', fontSize: 14 }}>Hội viên</h3>
      {error && <div className="form-error" role="alert">{error}</div>}
      <Field label="Chọn khách cho ca này" htmlFor="pf-member">
        <span style={{ display: 'flex', gap: 8 }}>
          <Select id="pf-member" disabled={!!chosen} value={contractId} onChange={(e) => setContractId(e.target.value)}>
            <option value="" disabled>{contracts.length ? 'Chọn hội viên' : 'Chưa có hội viên còn buổi'}</option>
            {contracts.map((c) => <option key={c.id} value={c.id}>{c.member.name} ({c.member.code}), còn {c.sessions_left} buổi</option>)}
          </Select>
          <Button variant="primary" onClick={assign} disabled={busy || !contractId || !!chosen}>Chọn khách</Button>
        </span>
      </Field>
    </Modal>
  )
}
