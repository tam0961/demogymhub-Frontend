import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { mockAdapter } from '../mock/adapter'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { InvoiceModal } from '../components/InvoiceModal'
import InvoiceSettings from '../pages/InvoiceSettings'
import { ToastProvider } from '../components/Toast'
import type { Contract } from '../types'

vi.mock('../lib/api', async () => {
  const ax = (await import('axios')).default
  const { mockAdapter: adapter } = await import('../mock/adapter')
  return { api: ax.create({ adapter, headers: { Authorization: 'Bearer t' } }) }
})

const contract = {
  id: 'c-inv-1',
  code: 'HD001',
  paid_amount: 1_100_000,
  member: { id: 'm1', code: 'HV1', name: 'Nguyễn Văn A', phone: '0900000000', email: 'a@b.vn' },
  package: { id: 'p1', name: 'Gói 3 tháng', type: 'month', category: 'member' },
} as unknown as Contract

beforeAll(async () => {
  const http = axios.create({ adapter: mockAdapter, headers: { Authorization: 'Bearer t' } })
  await http.post('/auth/login', { email: 'admin@gymhub.vn', password: 'admin123' })
})

afterEach(() => cleanup())

describe('invoice modal', () => {
  it('prefills the contract, issues in test mode and lists the result', async () => {
    render(<InvoiceModal contract={contract} onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText(/Chế độ chạy thử/)).toBeTruthy())
    expect((screen.getByLabelText('Tên người mua hoặc đơn vị') as HTMLInputElement).value).toBe('Nguyễn Văn A')
    expect((screen.getByLabelText('Tên hàng') as HTMLInputElement).value).toBe('Gói 3 tháng')
    expect((screen.getByLabelText('Số tiền đã gồm VAT') as HTMLInputElement).value).toBe('1100000')
    expect(screen.getByText('Chưa có hóa đơn nào.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Lập hóa đơn' }))
    await waitFor(() => expect(screen.getByText('Tổng thanh toán')).toBeTruthy())
    expect(screen.getByText('Tiền hàng')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Chạy thử')).toBeTruthy())
  })

  it('shows the validation message when the buyer name is empty', async () => {
    render(<InvoiceModal contract={contract} onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText(/Chế độ chạy thử/)).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Tên người mua hoặc đơn vị'), { target: { value: ' ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lập hóa đơn' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Chưa có tên người mua'))
  })
})

describe('invoice settings', () => {
  it('never shows the saved password and warns when live mode is turned on', async () => {
    render(<ToastProvider><InvoiceSettings /></ToastProvider>)
    await waitFor(() => expect(screen.getByLabelText('Mật khẩu API')).toBeTruthy())
    expect((screen.getByLabelText('Mật khẩu API') as HTMLInputElement).value).toBe('')
    expect(screen.queryByText(/IP đã đăng ký/)).toBeNull()
    fireEvent.click(screen.getByLabelText(/Phát hành thật/))
    expect(screen.getByText(/IP đã đăng ký/)).toBeTruthy()
  })
})
