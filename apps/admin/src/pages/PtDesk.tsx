import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtTime } from '../lib/format'
import { useBranch } from '../context/BranchContext'
import { usePermission } from '../context/usePermission'
import { Modal } from '../components/Modal'
import { PtAddModal, PtBookModal } from '../components/PtBookModal'
import { Button, Chip, EmptyState, Input, PageHeader, Select, useToast, type ChipTone } from '../components/ui'
import type { PtSession, PtStatus } from '../types'

interface Trainer { id: string; name: string; branches?: { id: string; name: string }[] }

const pad = (n: number) => String(n).padStart(2, '0')
const localISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const shift = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return localISO(d) }
const dayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' })
const STATUS: Record<PtStatus, { label: string; tone: ChipTone }> = {
  scheduled: { label: 'Đã đặt lịch', tone: 'neutral' },
  completed: { label: 'Hoàn thành', tone: 'ok' },
  no_show: { label: 'Vắng mặt', tone: 'warn' },
  cancelled: { label: 'Đã hủy', tone: 'bad' },
}

export default function PtDesk() {
  const { branchId } = useBranch()
  const { can } = usePermission()
  const toast = useToast()
  const [day, setDay] = useState(localISO(new Date()))
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [trainerId, setTrainerId] = useState('')
  const [rows, setRows] = useState<PtSession[]>([])
  const [error, setError] = useState('')
  const [signing, setSigning] = useState<PtSession | null>(null)
  const [detail, setDetail] = useState<PtSession | null>(null)
  const [assigning, setAssigning] = useState<PtSession | null>(null)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    api.get<{ data: Trainer[] }>('/pt/trainers', { params: { branch_id: branchId ?? undefined } })
      .then((r) => { setTrainers(r.data.data); setTrainerId((cur) => (r.data.data.some((t) => t.id === cur) ? cur : r.data.data[0]?.id ?? '')) })
      .catch(() => setTrainers([]))
  }, [branchId])

  const load = useCallback(async () => {
    setError('')
    try {
      const { data } = await api.get<{ data: PtSession[] }>('/pt/sessions', { params: { from: day, to: day, branch_id: branchId ?? undefined } })
      setRows(data.data.filter((s) => s.trainer.id === trainerId).sort((a, b) => a.start_at.localeCompare(b.start_at)))
    } catch (e) {
      setError(apiError(e).message)
    }
  }, [day, branchId, trainerId])
  useEffect(() => { if (trainerId) load() }, [load, trainerId])

  const act = async (s: PtSession, kind: 'complete' | 'no-show') => {
    try {
      await api.post(`/pt/sessions/${s.id}/${kind}`)
      toast(kind === 'complete' ? 'Đã xác nhận buổi tập' : 'Đã ghi nhận vắng mặt, đã trừ 1 buổi')
      load()
    } catch (e) {
      toast(apiError(e).message)
    }
  }
  const trainer = trainers.find((t) => t.id === trainerId)

  return (
    <>
      <PageHeader title="Lịch dạy PT" sub="Chọn tên PT, xem các ca đã báo trong nhóm Zalo và chốt từng buổi PT." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
        <Select aria-label="PT" value={trainerId} onChange={(e) => setTrainerId(e.target.value)} style={{ minWidth: 280 }}>
          {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}{t.branches?.[0] ? ` (${t.branches[0].name.replace(/^Chi nhánh\s+/i, '')})` : ''}</option>)}
        </Select>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button onClick={() => setDay(shift(day, -1))} aria-label="Lùi">‹</Button>
          <Input type="date" aria-label="Ngày" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
          <b>{dayLabel(day)}</b>
          <Button onClick={() => setDay(shift(day, 1))} aria-label="Tiến">›</Button>
          <Button onClick={() => setDay(localISO(new Date()))}>Hôm nay</Button>
        </div>
        {can('pt_sessions.create') && <Button variant="primary" onClick={() => setAdding(true)}>+ Đăng ký buổi PT</Button>}
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}
      <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Buổi PT 1:1</h2>
      {rows.length === 0 ? <EmptyState title="Chưa có buổi nào trong ngày" hint={trainer ? `${trainer.name} chưa báo ca hoặc chưa có khách đặt.` : undefined} /> : (
        <div style={{ display: 'grid', gap: 12 }}>
          {rows.map((s) => {
            const open = s.status === 'scheduled'
            const early = day > localISO(new Date())
            return (
              <section key={s.id} className="panel" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div>
                    <b>{fmtTime(s.start_at)} · PT 1:1</b>
                    <div className="cell-sub">{!s.member && open ? 'Ca đã báo, chưa có khách' : STATUS[s.status].label}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {open && !s.member && can('pt_sessions.create') && <Button onClick={() => setAssigning(s)}>Gán khách</Button>}
                    {open && s.member && can('pt_sessions.complete') && <Button onClick={() => act(s, 'no-show')}>Vắng mặt</Button>}
                    {open && s.member && can('pt_sessions.complete') && <Button variant="primary" disabled={early} title={early ? 'Chỉ hoàn thành được buổi dạy trong ngày' : undefined} onClick={() => setSigning(s)}>Hoàn thành buổi</Button>}
                    <Button onClick={() => setDetail(s)}>Chi tiết</Button>
                  </div>
                </div>
                {s.member && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, gap: 12 }}>
                    <span>{s.member.name} <span className="cell-sub">{s.member.code}</span></span>
                    {open ? <span className="cell-sub">{s.sessions_left != null ? `còn ${s.sessions_left} buổi` : ''}</span> : <Chip tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Chip>}
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
      <p className="ptg-note" style={{ marginTop: 16 }}>
        Khách tập PT không cần check-in. PT báo ca trong nhóm Zalo, gán khách cho ca, rồi bấm Hoàn thành buổi: trừ 1 buổi và khách ký xác nhận.
        Khách không đến thì bấm Vắng mặt: vẫn trừ 1 buổi. Khách hủy thì phải hủy trước giờ dạy ít nhất 90 phút. Chỉ hoàn thành được buổi trong ngày dạy.
      </p>

      {signing && (
        <Modal title="Khách ký xác nhận" onClose={() => setSigning(null)} footer={<><Button onClick={() => setSigning(null)}>Hủy</Button><Button variant="primary" onClick={() => { const s = signing; setSigning(null); act(s, 'complete') }}>Khách đã ký, hoàn thành</Button></>}>
          <div className="sign-wait">
            <div className="sign-ico" aria-hidden="true">✍</div>
            <h3>Chuyển iPad cho khách ký tên</h3>
            <p>Khách ký xác nhận đã tập xong buổi PT, sau đó bấm "Khách đã ký, hoàn thành".</p>
          </div>
        </Modal>
      )}
      {detail && (
        <Modal title={detail.member?.name ?? 'Ca chưa có khách'} onClose={() => setDetail(null)} footer={<Button onClick={() => setDetail(null)}>Đóng</Button>}>
          <dl className="kv">
            <dt>PT</dt><dd>{detail.trainer.name}</dd>
            <dt>Giờ</dt><dd>{fmtTime(detail.start_at)} - {fmtTime(detail.end_at)}</dd>
            <dt>Khách</dt><dd>{detail.member ? `${detail.member.name} - ${detail.member.phone}` : 'Chưa có khách'}</dd>
            <dt>Hợp đồng</dt><dd>{detail.contract_code ?? '-'}</dd>
            <dt>Số buổi còn lại</dt><dd>{detail.sessions_left != null ? `${detail.sessions_left} buổi` : '-'}</dd>
            <dt>Trạng thái</dt><dd>{STATUS[detail.status].label}</dd>
            {detail.note && <><dt>Ghi chú</dt><dd>{detail.note}</dd></>}
          </dl>
        </Modal>
      )}
      {assigning && <PtBookModal day={day} trainers={trainers} assign={assigning} onClose={() => setAssigning(null)} onSaved={() => { setAssigning(null); toast('Đã gán khách'); load() }} />}
      {adding && <PtAddModal day={day} trainers={trainers} initial={{ trainerId, date: day }} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); toast('Đã đặt buổi PT'); load() }} />}
    </>
  )
}
