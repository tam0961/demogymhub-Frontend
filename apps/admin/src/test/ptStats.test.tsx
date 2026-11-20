import { describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { mockAdapter } from '../mock/adapter'
import { ptSalesTotal, sessionsText } from '../lib/payroll'
import { PtStatsSection } from '../pages/PtStats'

vi.mock('../lib/api', async () => {
  const ax = (await import('axios')).default
  const { mockAdapter: adapter } = await import('../mock/adapter')
  return { api: ax.create({ adapter, headers: { Authorization: 'Bearer t' } }) }
})

describe('pt stats', () => {
  it('formats helpers', () => {
    expect(sessionsText(6, 10)).toBe('6 / 10')
    expect(sessionsText(null, null)).toBe('-')
    expect(ptSalesTotal({ member_sales: 3, pt_sales: 4 })).toBe(7)
  })

  it('serves the mock endpoint', async () => {
    const http = axios.create({ adapter: mockAdapter, headers: { Authorization: 'Bearer t' } })
    await http.post('/auth/login', { email: 'admin@gymhub.vn', password: 'admin123' })
    const rows = (await http.get('/payroll/pt-stats', { params: { month: '2026-11' } })).data.data.rows
    expect(rows).toHaveLength(3)
  })

  it('shows headline numbers collapsed and the tables when expanded', async () => {
    render(<PtStatsSection month="2026-11" />)
    await waitFor(() => expect(screen.getByText('Khánh')).toBeTruthy())
    expect(screen.queryByText(/Khách hàng đang dạy/, { selector: 'h3' })).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { expanded: false })[0])
    expect(screen.getByText(/Khách hàng đang dạy/, { selector: 'h3' })).toBeTruthy()
    expect(screen.getByText('Học viên Khánh 1')).toBeTruthy()
  })
})
