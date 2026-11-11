import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { downloadBlob, fmtDateTime, toCSV } from '../lib/format'
import { Badge, Button, Field, Input, Pager } from '../components/ui'
import type { AuditRow, ListResp } from '../types'

const LIMIT = 20

export function auditToCSV(rows: AuditRow[]) {
  return toCSV([['Thời gian', 'Người thực hiện', 'Hành động', 'Đối tượng', 'Kết quả', 'IP'], ...rows.map((r) => [r.created_at, r.actor_email ?? r.actor ?? '', r.action, r.resource ?? '', r.result ?? '', r.ip ?? ''])])
}

export default function Audit() {
  const [actor, setActor] = useState('')
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [rows, setRows] = useState<AuditRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const query = useCallback((p: number, limit: number) => ({ actor: actor || undefined, action: action || undefined, from: from || undefined, to: to || undefined, page: p, limit }), [actor, action, from, to])

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const { data } = await api.get<ListResp<AuditRow>>('/audit-logs', { params: query(page, LIMIT) })
        setRows(data.data)
        setTotal(data.meta.total)
        setError('')
      } catch (e) {
        setError(apiError(e).message)
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [query, page])

  const exportCsv = async () => {
    try {
      const { data } = await api.get<ListResp<AuditRow>>('/audit-logs', { params: query(1, 1000) })
      downloadBlob(new Blob(['﻿' + auditToCSV(data.data)], { type: 'text/csv;charset=utf-8' }), 'nhat-ky.csv')
    } catch (e) {
      setError(apiError(e).message)
    }
  }
  const set = (f: (v: string) => void) => (v: string) => {
    f(v)
    setPage(1)
  }

  return (
    <>
      <div className="page-head">
        <h1>Nhật ký hệ thống</h1>
        <Button onClick={exportCsv}>Xuất CSV</Button>
      </div>
      <div className="filters">
        <Field label="Người thực hiện" htmlFor="au-actor"><Input id="au-actor" placeholder="ID người dùng (UUID)" value={actor} onChange={(e) => set(setActor)(e.target.value)} /></Field>
        <Field label="Hành động" htmlFor="au-action"><Input id="au-action" value={action} onChange={(e) => set(setAction)(e.target.value)} /></Field>
        <Field label="Từ ngày" htmlFor="au-from"><Input id="au-from" type="date" value={from} onChange={(e) => set(setFrom)(e.target.value)} /></Field>
        <Field label="Đến ngày" htmlFor="au-to"><Input id="au-to" type="date" value={to} onChange={(e) => set(setTo)(e.target.value)} /></Field>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Đối tượng</th><th>Kết quả</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDateTime(r.created_at)}</td>
                  <td>{r.actor_email ?? r.actor ?? '-'}</td>
                  <td>{r.action}</td>
                  <td>{r.target_id ?? r.resource ?? '-'}</td>
                  <td>{r.action.includes('denied') ? <Badge tone="bad">DENY</Badge> : r.result ? <Badge tone={r.result === 'DENY' ? 'bad' : 'ok'}>{r.result}</Badge> : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div className="empty">Đang tải...</div>}
          {!loading && error && <div className="empty" role="alert">{error}</div>}
          {!loading && !error && rows.length === 0 && <div className="empty">Không có bản ghi</div>}
        </div>
        <Pager page={page} limit={LIMIT} total={total} onPage={setPage} />
      </div>
    </>
  )
}
