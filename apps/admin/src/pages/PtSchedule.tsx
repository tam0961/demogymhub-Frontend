import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtTime } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import { RequirePermission, usePermission } from '../context/usePermission'
import { useAuth } from '../context/AuthContext'
import { Modal } from '../components/Modal'
import { Button, Chip, DataTable, Field, Input, PageHeader, Select, Tabs, Textarea, useToast, type Column, type ChipTone } from '../components/ui'
import PtGroup from './PtGroup'
import type { Contract, ListResp, Member, PtSession, PtStatus } from '../types'

type Tab = 'one' | 'group'
interface Trainer { id: string; name: string }

const STATUS: Record<PtStatus, { label: string; tone: ChipTone }> = {
  scheduled: { label: 'Sắp tới', tone: 'warn' },
  completed: { label: 'Đã dạy', tone: 'ok' },
  cancelled: { label: 'Đã hủy', tone: 'bad' },
  no_show: { label: 'Vắng mặt', tone: 'warn' },
}

const pad = (n: number) => String(n).padStart(2, '0')
const localISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const shiftDay = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + n)
  return localISO(d)
}

export default function PtSchedule() {
  const [tab, setTab] = useState<Tab>('one')
  return (
    <>
      <PageHeader title="Lịch PT" />
      <Tabs<Tab> tabs={[{ value: 'one', label: 'PT 1:1' }, { value: 'group', label: 'PT nhóm' }]} value={tab} onChange={setTab} />
      {tab === 'one' ? <OneOnOne /> : <PtGroup />}
    </>
  )
}

function OneOnOne() {
  const { branchId } = useBranch()
  const { can } = usePermission()
  const toast = useToast()
  const [day, setDay] = useState(localISO(new Date()))
  const [trainerId, setTrainerId] = useState('')
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [rows, setRows] = useState<PtSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [assigning, setAssigning] = useState<PtSession | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get<{ data: PtSession[] }>('/pt/sessions', { params: { from: day, to: day, trainer_id: trainerId || undefined, branch_id: branchId ?? undefined } })
      setRows(data.data)
    } catch (e) {
      setError(apiError(e).message)
    } finally {
      setLoading(false)
    }
  }, [day, trainerId, branchId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    api.get<{ data: Trainer[] }>('/pt/trainers', { params: { branch_id: branchId ?? undefined } }).then((r) => setTrainers(r.data.data)).catch(() => setTrainers([]))
  }, [branchId])

  const act = async (s: PtSession, kind: 'complete' | 'cancel') => {
    try {
      await api.post(`/pt/sessions/${s.id}/${kind}`)
      toast(kind === 'complete' ? 'Đã xác nhận buổi tập' : 'Đã hủy buổi')
      load()
    } catch (e) {
      toast(apiError(e).message)
    }
  }

  const columns: Column<PtSession>[] = [
    { key: 'time', header: 'Giờ', numeric: true, sortValue: (s) => s.start_at, render: (s) => `${fmtTime(s.start_at)} - ${fmtTime(s.end_at)}` },
    { key: 'member', header: 'Hội viên', sortValue: (s) => s.member?.name ?? '', render: (s) => (s.member ? <><span className="cell-main">{s.member.name}</span><div className="cell-sub">{s.member.code}</div></> : <span className="cell-sub">Chưa gán khách</span>) },
    { key: 'trainer', header: 'PT', sortValue: (s) => s.trainer.name, render: (s) => s.trainer.name },
    { key: 'contract', header: 'Hợp đồng', render: (s) => (s.contract_code ? <>{s.contract_code}<div className="cell-sub">Còn {s.sessions_left ?? 0} buổi</div></> : '-') },
    { key: 'status', header: 'Trạng thái', sortValue: (s) => s.status, render: (s) => <Chip tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Chip> },
    {
      key: 'act',
      header: '',
      render: (s) => s.status !== 'scheduled' ? null : (
        <span style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
          {!s.member && (can('pt_sessions.create') || can('pt_sessions.complete')) && <Button small onClick={() => setAssigning(s)}>Gán khách</Button>}
          {s.member && can('pt_sessions.complete') && <Button small variant="primary" onClick={() => act(s, 'complete')}>Hoàn thành</Button>}
          {can('pt_sessions.cancel') && <Button small variant="danger" onClick={() => act(s, 'cancel')}>Hủy</Button>}
        </span>
      ),
    },
  ]

  return (
    <>
      <div className="toolbar">
        <Button small onClick={() => setDay(shiftDay(day, -1))} aria-label="Ngày trước">‹</Button>
        <Input type="date" aria-label="Ngày" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
        <Button small onClick={() => setDay(shiftDay(day, 1))} aria-label="Ngày sau">›</Button>
        <Button small onClick={() => setDay(localISO(new Date()))}>Hôm nay</Button>
        <Select aria-label="Lọc PT" value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
          <option value="">Mọi PT</option>
          {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <div className="grow">
          <RequirePermission permission="pt_sessions.create"><Button variant="primary" onClick={() => setAdding(true)}>Đặt buổi PT</Button></RequirePermission>
        </div>
      </div>
      <div className="card">
        <DataTable columns={columns} rows={rows} rowKey={(s) => s.id} loading={loading} error={error} emptyText="Không có buổi PT trong ngày" itemLabel="buổi" />
      </div>
      {assigning && <BookModal day={day} trainers={trainers} assign={assigning} onClose={() => setAssigning(null)} onSaved={() => { setAssigning(null); toast('Đã gán khách'); load() }} />}
      {adding && <BookModal day={day} trainers={trainers} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); toast('Đã đặt buổi PT'); load() }} />}
    </>
  )
}

function BookModal({ day, trainers, assign, onClose, onSaved }: { day: string; trainers: Trainer[]; assign?: PtSession; onClose: () => void; onSaved: () => void }) {
  const { branchId } = useBranch()
  const { user } = useAuth()
  const [q, setQ] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [memberId, setMemberId] = useState('')
  const [contracts, setContracts] = useState<Contract[]>([])
  const [contractId, setContractId] = useState('')
  const [trainerId, setTrainerId] = useState('')
  const [date, setDate] = useState(day)
  const [time, setTime] = useState('09:00')
  const [duration, setDuration] = useState('60')
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
      .then((r) => setContracts(r.data.data.filter((c) => (c.package.category === 'pt_1on1' || c.package.category === 'pt_1on2') && c.sessions_total != null && (c.sessions_left ?? 0) > 0)))
      .catch(() => setContracts([]))
  }, [memberId])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
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
      title={assign ? 'Gán khách vào ca' : 'Đặt buổi PT 1:1'}
      onClose={onClose}
      footer={<><Button onClick={onClose}>Hủy</Button><Button variant="primary" type="submit" form="pt-form" disabled={busy || (assign ? !memberId : !trainerId)}>{busy ? 'Đang lưu...' : assign ? 'Gán khách' : 'Đặt buổi'}</Button></>}
    >
      <form id="pt-form" className="form-grid" onSubmit={submit}>
        {error && <div className="form-error full" role="alert">{error}</div>}
        <Field label="Tìm hội viên (tên, SĐT, mã)" htmlFor="pt-q" full>
          <Input id="pt-q" value={q} onChange={(e) => { setQ(e.target.value); setMemberId('') }} />
        </Field>
        <Field label="Hội viên" htmlFor="pt-member" full>
          <Select id="pt-member" required={!!assign} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="" disabled>{members.length ? 'Chọn hội viên' : 'Nhập để tìm'}</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name} - {m.phone}</option>)}
          </Select>
        </Field>
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
        <Field label="Ghi chú" htmlFor="pt-note" full><Textarea id="pt-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </form>
    </Modal>
  )
}
