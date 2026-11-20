import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { mockAdapter } from '../mock/adapter'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import SheetSync from '../pages/SheetSync'
import { ToastProvider } from '../components/Toast'

vi.mock('../lib/api', async () => {
  const ax = (await import('axios')).default
  const { mockAdapter: adapter } = await import('../mock/adapter')
  return { api: ax.create({ adapter, headers: { Authorization: 'Bearer t' } }) }
})

beforeAll(async () => {
  const http = axios.create({ adapter: mockAdapter, headers: { Authorization: 'Bearer t' } })
  await http.post('/auth/login', { email: 'admin@gymhub.vn', password: 'admin123' })
})

afterEach(() => cleanup())

const page = () => render(<ToastProvider><SheetSync /></ToastProvider>)

describe('sheet sync page', () => {
  it('shows both switches, the write counts and the problem rows with reasons', async () => {
    page()
    await waitFor(() => expect(screen.getByText('Ghi sang Sheet')).toBeTruthy())
    expect(screen.getByText('Kéo từ Sheet về app')).toBeTruthy()
    expect(screen.getByText(/Số điện thoại chưa có trong tab Members/)).toBeTruthy()
    expect(screen.getByText('Lỗi (2 lần)')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Thử gửi lại' })).toBeTruthy()
  })

  it('refuses to turn the pull on without a URL and asks before switching off', async () => {
    page()
    await waitFor(() => expect(screen.getByLabelText('Bật hoặc tắt kéo từ Sheet')).toBeTruthy())
    const pull = screen.getByLabelText('Bật hoặc tắt kéo từ Sheet')
    fireEvent.click(pull.querySelectorAll('button')[0])
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thiết lập' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Cần dán địa chỉ Web app'))

    fireEvent.change(screen.getByLabelText(/Địa chỉ Web app Apps Script đọc Sheet/), { target: { value: 'https://script.google.com/macros/s/AKfycbX/exec' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thiết lập' }))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())

    fireEvent.click(screen.getByLabelText('Bật hoặc tắt kéo từ Sheet').querySelectorAll('button')[1])
    await waitFor(() => expect(screen.getByText('Tắt đồng bộ?')).toBeTruthy())
  })

  it('opens the Apps Script steps with the code', async () => {
    page()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lấy mã Apps Script' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Lấy mã Apps Script' }))
    await waitFor(() => expect(screen.getByLabelText('Mã Apps Script')).toBeTruthy())
    expect((screen.getByLabelText('Mã Apps Script') as HTMLTextAreaElement).value).toContain('SECRET')
    expect(screen.getByRole('button', { name: 'Sao chép mã' })).toBeTruthy()
  })

  it('lists Sheet members missing in the app and creates them one at a time', async () => {
    page()
    await waitFor(() => expect(screen.getByText('Lê Vân')).toBeTruthy())
    expect(screen.getByText(/tự được thêm vào tab Members của Sheet \(cần có email\)/)).toBeTruthy()
    expect(screen.getByText('Bùi Nguyệt Ánh')).toBeTruthy()
    const buttons = screen.getAllByRole('button', { name: 'Tạo hội viên' })
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[0])
    await waitFor(() => expect(screen.queryByText('Lê Vân')).toBeNull())
    expect(screen.getByText('Bùi Nguyệt Ánh')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Tạo hội viên' })).toHaveLength(1)
  })

  it('previews the import of every Sheet member before writing anything', async () => {
    page()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Xem trước' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước' }))
    await waitFor(() => expect(screen.getByText(/Xem trước, chưa ghi gì/)).toBeTruthy())
    expect(screen.getByText(/Tạo hội viên và PT NHÓM 20 BUỔI cộng 2 buổi khuyến mãi/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Nhập thật' }))
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Nhập thật' }).length).toBe(2))
    fireEvent.click(screen.getAllByRole('button', { name: 'Nhập thật' })[1])
    await waitFor(() => expect(screen.getByText(/Đã nhập\./)).toBeTruthy())
  })
})
