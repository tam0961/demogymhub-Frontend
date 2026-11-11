import { describe, expect, it } from 'vitest'
import { CreateFlowError, contractStatusLabel, contractsToCSV, paymentCode, runCreateContract, sortByDebt, totalDebt, type CreateInput } from '../lib/contracts'
import { groupPermissions } from '../pages/Roles'
import type { Contract } from '../types'

const base: CreateInput = {
  member: { name: 'Nguyễn Văn An', phone: '0903123456', gender: 'male', branch_id: 'b1' },
  package_id: 'p1', discount: 0, note: '', signature: 'data:image/png;base64,xx', paid: 700000, method: 'cash', canApprove: false, startDate: '2026-11-11', today: '2026-11-11',
}

function recorder(opts: { total?: number; payStatus?: string; failOn?: string } = {}) {
  const calls: { url: string; body: unknown }[] = []
  const post = async (url: string, body?: unknown) => {
    calls.push({ url, body })
    if (opts.failOn && url.includes(opts.failOn)) throw new Error('boom')
    if (url === '/members') return { data: { data: { id: 'm1' } } }
    if (url === '/contracts') return { data: { data: { id: 'c1', total_amount: opts.total ?? 700000 } } }
    if (url === '/payments') return { data: { data: { id: 'pay1', status: opts.payStatus ?? 'confirmed' } } }
    return { data: { data: {} } }
  }
  return { calls, post }
}
const msg = (e: unknown) => (e as Error).message

describe('runCreateContract', () => {
  it('runs member, contract, sign, payment, activate in order', async () => {
    const r = recorder()
    const out = await runCreateContract(r.post, base, msg)
    expect(r.calls.map((c) => c.url)).toEqual(['/members', '/contracts', '/contracts/c1/sign', '/payments', '/contracts/c1/activate'])
    expect(out.activated).toBe(true)
    expect(r.calls[0].body).toMatchObject({ name: 'Nguyễn Văn An', phone: '0903123456', branch_id: 'b1' })
  })
  it('skips member creation for existing member and payment when nothing is paid', async () => {
    const r = recorder({ total: 0 })
    await runCreateContract(r.post, { ...base, member: { id: 'm9' }, paid: 0 }, msg)
    expect(r.calls.map((c) => c.url)).toEqual(['/contracts', '/contracts/c1/sign', '/contracts/c1/activate'])
  })
  it('leaves signed contract unactivated when debt remains and user cannot approve', async () => {
    const r = recorder()
    const out = await runCreateContract(r.post, { ...base, paid: 200000 }, msg)
    expect(r.calls.map((c) => c.url)).toEqual(['/members', '/contracts', '/contracts/c1/sign', '/payments'])
    expect(out.activated).toBe(false)
    expect(out.notes[0]).toContain('còn nợ')
  })
  it('activates with allow_debt when approver and debt remains', async () => {
    const r = recorder()
    await runCreateContract(r.post, { ...base, paid: 200000, canApprove: true }, msg)
    expect(r.calls[r.calls.length - 1]).toEqual({ url: '/contracts/c1/activate', body: { allow_debt: true } })
  })
  it('pending payment does not reduce debt', async () => {
    const r = recorder({ payStatus: 'pending' })
    const out = await runCreateContract(r.post, base, msg)
    expect(out.activated).toBe(false)
  })
  it('without signature stops after creating the draft', async () => {
    const r = recorder()
    const out = await runCreateContract(r.post, { ...base, signature: null }, msg)
    expect(r.calls.map((c) => c.url)).toEqual(['/members', '/contracts'])
    expect(out.signed).toBe(false)
  })
  it('keeps what was created when a later step fails', async () => {
    const r = recorder({ failOn: '/payments' })
    const err = await runCreateContract(r.post, base, msg).catch((e) => e)
    expect(err).toBeInstanceOf(CreateFlowError)
    expect(err.step).toBe('payment')
    expect(err.outcome).toMatchObject({ memberId: 'm1', contractId: 'c1', signed: true, activated: false })
    expect(r.calls.some((c) => c.url.includes('activate'))).toBe(false)
  })
  it('fails on the first step with nothing created', async () => {
    const r = recorder({ failOn: '/members' })
    const err = await runCreateContract(r.post, base, msg).catch((e) => e)
    expect(err.step).toBe('member')
    expect(err.outcome.contractId).toBeUndefined()
  })
})

const mk = (o: Partial<Contract>): Contract => ({
  id: 'c', code: 'HD1', member_id: 'm', package_id: 'p', branch_id: 'b', status: 'active', total_amount: 700000, discount: 0, paid_amount: 700000, debt_amount: 0,
  start_date: '2026-11-01', end_date: '2027-03-01', sessions_total: null, sessions_left: null, signed_at: '2026-11-01T00:00:00Z', activated_at: null, frozen_until: null,
  renewed_from_id: null, note: null, created_at: '2026-11-01T00:00:00Z', member: { id: 'm', code: 'HV1', name: 'An, "Bình"', phone: '09' }, package: { id: 'p', name: 'Gói 1 tháng', type: 'month' },
  last_payment_method: 'cash', branch: { id: 'b', code: 'NB', name: 'Nhà Bè' }, ...o,
})

describe('debt helpers', () => {
  it('sorts by debt desc and drops paid contracts', () => {
    const rows = sortByDebt([mk({ id: 'a', debt_amount: 100 }), mk({ id: 'b', debt_amount: 0 }), mk({ id: 'c', debt_amount: 900 }), mk({ id: 'd', debt_amount: 500 })])
    expect(rows.map((r) => r.id)).toEqual(['c', 'd', 'a'])
    expect(totalDebt(rows)).toBe(1500)
  })
})

describe('contract status labels and CSV', () => {
  it('maps every status to a Vietnamese label', () => {
    const t = '2026-11-11'
    expect(contractStatusLabel({ status: 'active', end_date: '2027-03-01' }, t).label).toBe('Còn hạn')
    expect(contractStatusLabel({ status: 'active', end_date: '2026-11-15' }, t).label).toBe('Sắp hết hạn')
    expect(contractStatusLabel({ status: 'expired', end_date: null }, t).label).toBe('Hết hạn')
    expect(contractStatusLabel({ status: 'frozen', end_date: null }, t).label).toBe('Bảo lưu')
    expect(contractStatusLabel({ status: 'signed', end_date: null }, t).label).toBe('Chưa kích hoạt')
    expect(contractStatusLabel({ status: 'draft', end_date: null }, t).label).toBe('Chờ ký')
    expect(contractStatusLabel({ status: 'cancelled', end_date: null }, t).label).toBe('Đã hủy')
  })
  it('exports a CSV with header, escaped fields and Vietnamese labels', () => {
    const csv = contractsToCSV([mk({ debt_amount: 210000 })])
    const [head, row] = csv.split('\r\n')
    expect(head.startsWith('Mã HĐ,Chi nhánh,Hội viên')).toBe(true)
    expect(row).toContain('"An, ""Bình"""')
    expect(row).toContain('Tiền mặt')
    expect(row).toContain('210000')
    expect(row).toContain('Nhà Bè')
  })
  it('derives a payment code', () => {
    expect(paymentCode({ id: 'pay123456', ref: null })).toBe('PTY123456'.length ? 'PT' + 'pay123456'.slice(-6).toUpperCase() : '')
    expect(paymentCode({ id: 'x', ref: 'GD1' })).toBe('GD1')
  })
})

describe('permission matrix', () => {
  it('groups permission keys by prefix', () => {
    const g = groupPermissions([{ id: '1', name: 'a', permissions: ['payments.read', 'contracts.read', 'contracts.sign'] }, { id: '2', name: 'b', permissions: [{ key: 'payments.read' }] }])
    expect(g).toEqual([{ group: 'contracts', keys: ['contracts.read', 'contracts.sign'] }, { group: 'payments', keys: ['payments.read'] }])
  })
})
