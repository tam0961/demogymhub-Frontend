import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { Badge } from '../components/ui'
import type { RoleRow } from '../types'

export default function Roles() {
  const [rows, setRows] = useState<RoleRow[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    api.get('/roles').then((r) => setRows(r.data.data)).catch((e) => setError(apiError(e).message))
  }, [])
  return (
    <>
      <div className="page-head"><h1>Vai trò</h1></div>
      {error && <div className="empty" role="alert">{error}</div>}
      <div className="stack">
        {rows.map((r) => (
          <section key={r.id} className="card pad stack">
            <h2>{r.name}</h2>
            {r.description && <div className="hint-muted">{r.description}</div>}
            <div className="chips">
              {r.permissions.map((p) => {
                const k = typeof p === 'string' ? p : p.key
                return <Badge key={k}>{k}</Badge>
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
