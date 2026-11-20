import { describe, expect, it } from 'vitest'
import axios from 'axios'
import { render, screen } from '@testing-library/react'
import { mockAdapter } from '../mock/adapter'
import { Heatmap, gradeTone } from '../pages/OpsStats'
import { NAV_GROUPS } from '../components/Layout'

describe('ops stats', () => {
  it('maps grade labels to tones', () => {
    expect(gradeTone('Rất tốt')).toBe('ok')
    expect(gradeTone('Trung bình')).toBe('warn')
    expect(gradeTone('Cần cải thiện')).toBe('bad')
  })

  it('renders an accessible heatmap with a label per cell', () => {
    const rows = Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
    rows[0][18] = 5
    render(<Heatmap rows={rows} />)
    expect(screen.getByRole('table', { name: /bản đồ nhiệt/i })).toBeTruthy()
    expect(screen.getByLabelText('Thứ 2, 18:00: 5 lượt')).toBeTruthy()
    expect(screen.getAllByRole('rowheader')).toHaveLength(7)
  })

  it('serves mock endpoints behind reports.view and is linked in the menu', async () => {
    const http = axios.create({ adapter: mockAdapter, headers: { Authorization: 'Bearer t' } })
    await http.post('/auth/login', { email: 'admin@gymhub.vn', password: 'admin123' })
    expect((await http.get('/reports/health')).data.data.parts).toHaveLength(4)
    const impacts = (await http.get('/reports/alerts')).data.data.map((a: { impact: number }) => a.impact)
    expect(impacts).toEqual([...impacts].sort((a: number, b: number) => b - a))
    expect((await http.get('/reports/capacity')).data.data.heatmap).toHaveLength(7)
    expect(NAV_GROUPS.flatMap((g) => g.items).some((i) => i.to === '/reports/ops')).toBe(true)
  })
})
