import { useEffect, useState } from 'react'
import { fetchAll } from '../lib/fetchAll'
import { apiError } from '../lib/errors'
import { downloadBlob, fmtDateTime, toCSV } from '../lib/format'
import { Button, Chip, DataTable, Icon, PageHeader, type Column } from '../components/ui'
import type { AuditRow } from '../types'

export function auditToCSV(rows: AuditRow[]) {
  return toCSV([['Thời gian', 'Người thực hiện', 'Hành động', 'Đối tượng', 'Kết quả', 'IP'], ...rows.map((r) => [r.created_at, r.actor_email ?? r.actor ?? '', r.action, r.resource ?? '', r.result ?? '', r.ip ?? ''])])
}

export const auditDenied = (r: AuditRow) => r.action.includes('denied') || r.result === 'DENY'

export default function Audit() {
  const [actor, setActor] = useState('')
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        setRows(await fetchAll<AuditRow>('/audit-logs', { actor: actor || undefined, action: action || undefined, from: from || undefined, to: to || undefined }, 5))
        setError('')
      } catch (e) {
        setError(apiError(e).message)
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [actor, action, from, to])

  const columns: Column<AuditRow>[] = [
    { key: 'at', header: 'Thời gian', sortValue: (r) => r.created_at, render: (r) => fmtDateTime(r.created_at) },
    { key: 'actor', header: 'Người thực hiện', sortValue: (r) => r.actor_email ?? r.actor, render: (r) => r.actor_email ?? r.actor ?? '-' },
    { key: 'action', header: 'Hành động', sortValue: (r) => r.action, render: (r) => <span className="cell-main">{r.action}</span> },
    { key: 'target', header: 'Đối tượng', render: (r) => r.target_id ?? r.resource ?? '-' },
    { key: 'ip', header: 'IP', render: (r) => r.ip ?? '-' },
    { key: 'result', header: 'Kết quả', render: (r) => (auditDenied(r) ? <Chip tone="bad">Bị từ chối</Chip> : r.result ? <Chip tone="ok">Cho phép</Chip> : <span className="hint-muted">-</span>) },
  ]

  return (
    <>
      <PageHeader title="Nhật ký thao tác" sub="Mọi thao tác nhạy cảm và các lần bị từ chối quyền" />
      <div className="toolbar">
        <input className="input" aria-label="Người thực hiện" placeholder="Người thực hiện (email, mã)" value={actor} onChange={(e) => setActor(e.target.value)} />
        <input className="input" aria-label="Hành động" placeholder="Hành động, ví dụ contracts.cancel" value={action} onChange={(e) => setAction(e.target.value)} />
        <input className="input" type="date" aria-label="Từ ngày" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input className="input" type="date" aria-label="Đến ngày" value={to} onChange={(e) => setTo(e.target.value)} />
        <div className="grow">
          <span className="hint-muted">{rows.length} bản ghi</span>
          <Button onClick={() => downloadBlob(new Blob(['﻿' + auditToCSV(rows)], { type: 'text/csv;charset=utf-8' }), 'nhat-ky.csv')} disabled={rows.length === 0}><Icon name="download" size={16} />Xuất CSV</Button>
        </div>
      </div>
      <div className="card">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.id} defaultSort={{ key: 'at', dir: 'desc' }} loading={loading} error={error} emptyText="Không có bản ghi" itemLabel="bản ghi" />
      </div>
    </>
  )
}
