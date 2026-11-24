import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DataTable } from '../components/DataTable'
import { leadColumns } from '../pages/Leads'
import { LEAD_STATUS, leadErrorText, reminderText } from '../lib/leads'
import { NAV_GROUPS } from '../components/Layout'
import type { Lead } from '../types'

afterEach(cleanup)

const lead = (over: Partial<Lead> = {}): Lead => ({
  id: 'l1', name: 'Phạm Quốc Bảo', phone: '0911000111', email: null, source: 'Facebook', interest: null, status: 'new', note: null, branch_id: 'b1', assigned_to: null,
  trial_at: null, member_id: null, created_at: '2026-11-01T00:00:00.000Z', updated_at: '2026-11-01T00:00:00.000Z', ...over,
})
const noop = () => {}

describe('lead status chips', () => {
  it('uses semantic tones', () => {
    expect(LEAD_STATUS.converted.tone).toBe('ok')
    expect(LEAD_STATUS.contacted.tone).toBe('warn')
    expect(LEAD_STATUS.lost.tone).toBe('bad')
  })
})

describe('leadColumns', () => {
  const render1 = (l: Lead, canEdit = true) =>
    render(<MemoryRouter><DataTable columns={leadColumns({ canEdit, onEdit: noop, onConvert: noop }, () => undefined)} rows={[l]} rowKey={(x) => x.id} /></MemoryRouter>)

  it('shows the convert button only for unconverted leads', () => {
    render1(lead())
    expect(screen.getByRole('button', { name: 'Chuyển hội viên' })).toBeTruthy()
    cleanup()
    render1(lead({ status: 'converted' }))
    expect(screen.queryByRole('button', { name: 'Chuyển hội viên' })).toBeNull()
    expect(screen.getByText('Đã chuyển hội viên')).toBeTruthy()
  })
  it('hides actions without leads.update', () => {
    render1(lead(), false)
    expect(screen.queryByRole('button', { name: 'Sửa' })).toBeNull()
  })
})

describe('leadErrorText', () => {
  it('maps the duplicate phone error to a Vietnamese message', () => {
    expect(leadErrorText({ status: 409, code: 'DUPLICATE_PHONE', message: 'x' }).form).toContain('Số điện thoại đã là hội viên')
  })
})

describe('reminderText', () => {
  it('names the member, package and end date', () => {
    const t = reminderText({ name: 'An', package_name: 'Gói 3 tháng', end_date: '2026-11-20', days_left: 3 })
    expect(t).toContain('Chào An')
    expect(t).toContain('Gói 3 tháng')
    expect(t).toContain('20/11/2026')
    expect(t).toContain('còn 3 ngày')
  })
  it('says today when it expires today', () => {
    expect(reminderText({ name: 'An', package_name: 'G', end_date: '2026-11-17', days_left: 0 })).toContain('hết hạn hôm nay')
  })
})

describe('navigation', () => {
  it('has the leads item under Marketing and no expiring item', () => {
    const items = NAV_GROUPS.find((g) => g.title === 'Marketing')!.items
    expect(items.find((i) => i.to === '/leads')).toMatchObject({ label: 'Khách tiềm năng', perm: ['leads.read'] })
    expect(NAV_GROUPS.flatMap((g) => g.items).find((i) => i.to === '/expiring')).toBeUndefined()
  })

  it('puts Phiếu thu under Khách hàng and Marketing between Tài chính and Nhân sự', () => {
    const titles = NAV_GROUPS.map((g) => g.title)
    expect(NAV_GROUPS.find((g) => g.title === 'Khách hàng')!.items.map((i) => i.to)).toContain('/payments')
    expect(NAV_GROUPS.find((g) => g.title === 'Tài chính')!.items.map((i) => i.to)).not.toContain('/payments')
    expect(titles.indexOf('Marketing')).toBe(titles.indexOf('Tài chính') + 1)
    expect(titles.indexOf('Nhân sự')).toBe(titles.indexOf('Marketing') + 1)
    expect(NAV_GROUPS.find((g) => g.title === 'Marketing')!.items.map((i) => i.to)).toContain('/marketing/stats')
  })
})
