import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { fmtDate } from '../lib/format'
import { reminderText } from '../lib/leads'
import { useBranch } from '../context/BranchContext'
import { BranchTag, Button, DataTable, PageHeader, Tabs, useToast, type Column } from '../components/ui'
import type { ExpiringRow } from '../types'

type Days = '7' | '14' | '30'
const TABS: { value: Days; label: string }[] = [{ value: '7', label: '7 ngày' }, { value: '14', label: '14 ngày' }, { value: '30', label: '30 ngày' }]

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export default function Expiring() {
  const { branchId } = useBranch()
  const toast = useToast()
  const [days, setDays] = useState<Days>('7')
  const [rows, setRows] = useState<ExpiringRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get<{ data: ExpiringRow[] }>('/reports/expiring', { params: { days, branch_id: branchId ?? undefined } })
      setRows(data.data)
    } catch (e) {
      setError(apiError(e).message)
    } finally {
      setLoading(false)
    }
  }, [days, branchId])
  useEffect(() => { load() }, [load])

  const copy = async (r: ExpiringRow) => toast((await copyText(reminderText(r))) ? 'Đã sao chép tin nhắn' : 'Không sao chép được')
  const copyAll = async () => toast((await copyText(rows.map(reminderText).join('\n\n'))) ? `Đã sao chép ${rows.length} tin nhắn` : 'Không sao chép được')

  const columns = useMemo<Column<ExpiringRow>[]>(() => [
    { key: 'code', header: 'Mã', sortValue: (r) => r.member_code, render: (r) => r.member_code },
    { key: 'name', header: 'Hội viên', sortValue: (r) => r.name, render: (r) => <><span className="cell-main">{r.name}</span><div className="cell-sub">{r.phone}</div></> },
    { key: 'pkg', header: 'Gói', sortValue: (r) => r.package_name, render: (r) => r.package_name },
    { key: 'branch', header: 'Chi nhánh', render: (r) => <BranchTag branch={r.branch} /> },
    { key: 'end', header: 'Hết hạn', numeric: true, sortValue: (r) => r.end_date, render: (r) => fmtDate(r.end_date) },
    { key: 'left', header: 'Còn lại', numeric: true, sortValue: (r) => r.days_left, render: (r) => (r.days_left === 0 ? 'Hôm nay' : `${r.days_left} ngày`) },
    { key: 'copy', header: '', render: (r) => <Button small onClick={(e) => { e.stopPropagation(); copy(r) }}>Sao chép tin nhắn</Button> },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [])

  return (
    <>
      <PageHeader title="Sắp hết hạn" action={<Button onClick={copyAll} disabled={rows.length === 0}>Sao chép tất cả tin nhắn</Button>} />
      <Tabs tabs={TABS} value={days} onChange={setDays} />
      <div className="card">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.member_id} loading={loading} error={error} emptyText={`Không có hội viên hết hạn trong ${days} ngày tới`} itemLabel="hội viên" />
      </div>
    </>
  )
}
