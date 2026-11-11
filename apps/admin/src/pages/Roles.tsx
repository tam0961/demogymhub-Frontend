import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { apiError } from '../lib/errors'
import { Chip, PageHeader, Panel } from '../components/ui'
import type { RoleRow } from '../types'

const keyOf = (p: string | { key: string }) => (typeof p === 'string' ? p : p.key)

export function groupPermissions(rows: RoleRow[]): { group: string; keys: string[] }[] {
  const all = [...new Set(rows.flatMap((r) => r.permissions.map(keyOf)))].sort()
  const groups = new Map<string, string[]>()
  all.forEach((k) => groups.set(k.split('.')[0], [...(groups.get(k.split('.')[0]) ?? []), k]))
  return [...groups.entries()].map(([group, keys]) => ({ group, keys }))
}

export default function Roles() {
  const [rows, setRows] = useState<RoleRow[]>([])
  const [error, setError] = useState('')
  useEffect(() => {
    api.get('/roles').then((r) => setRows(r.data.data)).catch((e) => setError(apiError(e).message))
  }, [])
  const groups = useMemo(() => groupPermissions(rows), [rows])
  const has = (r: RoleRow, k: string) => r.permissions.some((p) => keyOf(p) === k)

  return (
    <>
      <PageHeader title="Vai trò" sub="Ma trận quyền: mỗi cột là một vai trò" />
      {error && <div className="form-error" role="alert">{error}</div>}
      <div className="role-chips">
        {rows.map((r) => <Chip key={r.id}>{r.name}{r.description ? `: ${r.description}` : ''}</Chip>)}
      </div>
      <Panel title="Quyền theo vai trò" count={`${rows.length} vai trò`} flush>
        <div className="table-wrap">
          <table className="table matrix">
            <caption className="sr-only">Quyền của từng vai trò</caption>
            <thead>
              <tr>
                <th>Quyền</th>
                {rows.map((r) => <th key={r.id} className="num">{r.name}</th>)}
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.group}>
                <tr className="matrix-group"><td colSpan={rows.length + 1}>{g.group}</td></tr>
                {g.keys.map((k) => (
                  <tr key={k}>
                    <td>{k}</td>
                    {rows.map((r) => (
                      <td key={r.id} className="num">{has(r, k) ? <span className="yes" aria-label="Có quyền">Có</span> : <span className="no" aria-label="Không có quyền">-</span>}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </Panel>
    </>
  )
}
