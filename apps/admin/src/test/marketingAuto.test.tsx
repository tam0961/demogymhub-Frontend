import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { mockAdapter } from '../mock/adapter'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MarketingAutoPanel } from '../components/MarketingAutoPanel'
import { AuthContext, type AuthValue } from '../context/AuthContext'
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

afterEach(cleanup)

const auth = { user: { id: 'u1', name: 'Chủ', email: 'o@x.vn', roles: ['owner'], permissions: [], branches: [{ id: 'b-nb', code: 'nb', name: 'Nhà Bè' }] } } as unknown as AuthValue

const view = (canEdit = true) =>
  render(
    <AuthContext.Provider value={auth}>
      <ToastProvider>
        <MarketingAutoPanel canEdit={canEdit} />
      </ToastProvider>
    </AuthContext.Provider>,
  )

describe('marketing auto panel', () => {
  it('shows the ingest addresses with the key and the branch rules', async () => {
    view()
    await waitFor(() => expect(screen.getByText('Google Ads (gồm Google Maps)')).toBeTruthy())
    expect(screen.getByText(/\/api\/mk\/ads-in\?key=mockggkey/)).toBeTruthy()
    expect(screen.getByText(/\/api\/mk\/gbp-in\?key=mockgbpkey/)).toBeTruthy()
    expect((screen.getByLabelText('Quy tắc chi nhánh') as HTMLTextAreaElement).value).toBe('nhà bè=nb')
    expect(screen.getByText('Chưa có khóa nào.')).toBeTruthy()
  })

  it('shows a lead key once after creating it and hides the controls without permission', async () => {
    view()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Tạo khóa' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Tạo khóa' }))
    await waitFor(() => expect(screen.getByText(/\/api\/leads\/in\?key=mockleadkey/)).toBeTruthy())
    expect(screen.getByText(/\/api\/leads\/signed\?key=mockleadkey/)).toBeTruthy()
    cleanup()
    view(false)
    await waitFor(() => expect(screen.getByText('Google Ads (gồm Google Maps)')).toBeTruthy())
    expect(screen.queryByRole('button', { name: 'Tạo khóa' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Tạo khóa mới' })).toBeNull()
  })
})
