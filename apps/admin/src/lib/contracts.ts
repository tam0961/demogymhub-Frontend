import type { Contract, Gender, PayMethod, Payment } from '../types'
import { METHOD_LABEL, fmtDate, fmtMoney, memberStatus, toCSV } from './format'

export const CONTRACT_STATUS_OPTIONS = ['Còn hạn', 'Sắp hết hạn', 'Hết hạn', 'Bảo lưu', 'Chưa kích hoạt', 'Chờ ký', 'Đã hủy']

export const contractStatusLabel = (c: Pick<Contract, 'status' | 'end_date'>, today?: string) => memberStatus(c, today)

export const sortByDebt = <T extends { debt_amount: number }>(rows: T[]): T[] =>
  rows.filter((c) => c.debt_amount > 0).sort((a, b) => b.debt_amount - a.debt_amount)

export const totalDebt = (rows: { debt_amount: number }[]) => rows.reduce((s, c) => s + c.debt_amount, 0)

export function contractsToCSV(rows: Contract[]): string {
  const head = ['Mã HĐ', 'Chi nhánh', 'Hội viên', 'Mã hội viên', 'Dịch vụ', 'Ngày ký', 'Hết hạn', 'Giá trị', 'Hình thức', 'Còn nợ', 'Trạng thái']
  const body = rows.map((c) => [
    c.code, c.branch?.name ?? '', c.member.name, c.member.code, c.package.name, fmtDate(c.signed_at ?? c.created_at), fmtDate(c.end_date),
    c.total_amount, c.last_payment_method ? METHOD_LABEL[c.last_payment_method] : '', c.debt_amount, memberStatus(c).label,
  ])
  return toCSV([head, ...body])
}

export const paymentCode = (p: Pick<Payment, 'id' | 'ref'>) => p.ref ?? `PT${p.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()}`

type Post = (url: string, body?: unknown) => Promise<{ data: { data: any } }> // eslint-disable-line @typescript-eslint/no-explicit-any

export interface CreateInput {
  member: { id: string } | { name: string; phone: string; gender: Gender | ''; branch_id: string }
  package_id: string
  discount: number
  note: string
  signature: string | null
  paid: number
  method: PayMethod
  canApprove: boolean
  startDate?: string
  today?: string
}
export interface CreateOutcome {
  memberId?: string
  contractId?: string
  signed: boolean
  paymentId?: string
  paymentStatus?: Payment['status']
  activated: boolean
  notes: string[]
}
export class CreateFlowError extends Error {
  constructor(public step: 'member' | 'contract' | 'sign' | 'payment' | 'activate', message: string, public outcome: CreateOutcome) {
    super(message)
  }
}

export async function runCreateContract(post: Post, input: CreateInput, errText: (e: unknown) => string): Promise<CreateOutcome> {
  const out: CreateOutcome = { signed: false, activated: false, notes: [] }
  const run = async <T,>(step: CreateFlowError['step'], fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn()
    } catch (e) {
      throw new CreateFlowError(step, errText(e), out)
    }
  }
  let memberId: string
  if ('id' in input.member) memberId = input.member.id
  else {
    const m = input.member
    const r = await run('member', () => post('/members', { name: m.name.trim(), phone: m.phone.trim(), gender: m.gender || null, branch_id: m.branch_id, status: 'active', email: null, dob: null }))
    memberId = r.data.data.id
    out.memberId = memberId
  }
  const created = await run('contract', () => post('/contracts', { member_id: memberId, package_id: input.package_id, discount: input.discount || undefined, note: input.note.trim() || undefined }))
  const contract = created.data.data
  out.contractId = contract.id
  if (!input.signature) {
    out.notes.push('Hợp đồng đang ở trạng thái nháp, chờ ký.')
    return out
  }
  await run('sign', () => post(`/contracts/${contract.id}/sign`, { signature: input.signature }))
  out.signed = true
  let debt = Number(contract.total_amount ?? 0)
  if (input.paid > 0) {
    const pay = await run('payment', () => post('/payments', { contract_id: contract.id, method: input.method, amount: input.paid }))
    out.paymentId = pay.data.data.id
    out.paymentStatus = pay.data.data.status
    if (pay.data.data.status === 'confirmed') debt -= input.paid
    else out.notes.push('Khoản thu đang chờ xác nhận nên chưa tính vào số đã thu.')
  }
  if (debt > 0 && !input.canApprove) {
    out.notes.push(`Hợp đồng còn nợ ${fmtMoney(debt)} và bạn không có quyền duyệt, nên chưa kích hoạt. Hãy thu đủ tiền rồi kích hoạt.`)
    return out
  }
  const today = input.today ?? new Date().toISOString().slice(0, 10)
  const body: Record<string, unknown> = {}
  if (debt > 0) body.allow_debt = true
  if (input.startDate && input.startDate !== today) body.start_date = input.startDate
  await run('activate', () => post(`/contracts/${contract.id}/activate`, body))
  out.activated = true
  return out
}

export const STEP_LABEL: Record<CreateFlowError['step'], string> = {
  member: 'tạo hội viên', contract: 'tạo hợp đồng', sign: 'ký hợp đồng', payment: 'ghi nhận thu tiền', activate: 'kích hoạt hợp đồng',
}
