import { useMemo, useState, type ReactNode } from 'react'

export interface Column<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  sortValue?: (row: T) => string | number | null | undefined
  numeric?: boolean
  className?: string
}

export function sortRows<T>(rows: T[], col: Column<T> | undefined, dir: 'asc' | 'desc'): T[] {
  if (!col?.sortValue) return rows
  const get = col.sortValue
  const k = dir === 'asc' ? 1 : -1
  return rows
    .map((r, i) => ({ r, i, v: get(r) }))
    .sort((a, b) => {
      const av = a.v
      const bv = b.v
      if (av == null && bv == null) return a.i - b.i
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * k || a.i - b.i
      return String(av).localeCompare(String(bv), 'vi', { numeric: true }) * k || a.i - b.i
    })
    .map((x) => x.r)
}

export function paginate<T>(rows: T[], page: number, size: number): T[] {
  return rows.slice((page - 1) * size, page * size)
}

export function pageButtons(page: number, pages: number): number[] {
  const set = new Set([1, pages, page - 1, page, page + 1])
  return [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b)
}

interface Props<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  selectable?: boolean
  selected?: string[]
  onSelectionChange?: (keys: string[]) => void
  defaultSort?: { key: string; dir: 'asc' | 'desc' }
  pageSize?: number
  pageSizes?: number[]
  loading?: boolean
  error?: string
  emptyText?: string
  itemLabel?: string
  caption?: string
}

export function DataTable<T>({
  columns, rows, rowKey, onRowClick, selectable, selected = [], onSelectionChange, defaultSort, pageSize = 50,
  pageSizes = [25, 50, 100], loading, error, emptyText = 'Không có dữ liệu', itemLabel = 'mục', caption,
}: Props<T>) {
  const [sort, setSort] = useState(defaultSort ?? null)
  const [size, setSize] = useState(pageSize)
  const [page, setPage] = useState(1)

  const sorted = useMemo(() => (sort ? sortRows(rows, columns.find((c) => c.key === sort.key), sort.dir) : rows), [rows, columns, sort])
  const pages = Math.max(1, Math.ceil(sorted.length / size))
  const cur = Math.min(page, pages)
  const view = paginate(sorted, cur, size)
  const from = sorted.length ? (cur - 1) * size + 1 : 0
  const to = Math.min(cur * size, sorted.length)

  const toggleSort = (c: Column<T>) => {
    if (!c.sortValue) return
    setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'asc' }))
  }
  const viewKeys = view.map(rowKey)
  const allOn = viewKeys.length > 0 && viewKeys.every((k) => selected.includes(k))
  const toggleAll = () => onSelectionChange?.(allOn ? selected.filter((k) => !viewKeys.includes(k)) : [...new Set([...selected, ...viewKeys])])
  const toggleOne = (k: string) => onSelectionChange?.(selected.includes(k) ? selected.filter((x) => x !== k) : [...selected, k])

  return (
    <div className="dt">
      <div className="table-wrap">
        <table className="table">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr>
              {selectable && (
                <th className="col-check">
                  <input type="checkbox" aria-label="Chọn tất cả" checked={allOn} onChange={toggleAll} />
                </th>
              )}
              {columns.map((c) => {
                const active = sort?.key === c.key
                return (
                  <th key={c.key} className={c.numeric ? 'num' : ''} aria-sort={active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {c.sortValue ? (
                      <button type="button" className="th-sort" onClick={() => toggleSort(c)}>
                        {c.header}
                        <span className="th-arrow" aria-hidden="true">{active ? (sort?.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {view.map((r) => {
              const k = rowKey(r)
              return (
                <tr
                  key={k}
                  className={onRowClick ? 'clickable' : ''}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  onKeyDown={onRowClick ? (e) => e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onRowClick(r)) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                >
                  {selectable && (
                    <td className="col-check" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label="Chọn dòng" checked={selected.includes(k)} onChange={() => toggleOne(k)} />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} className={`${c.numeric ? 'num' : ''} ${c.className ?? ''}`}>{c.render(r)}</td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
        {loading && <div className="empty">Đang tải...</div>}
        {!loading && error && <div className="empty" role="alert">{error}</div>}
        {!loading && !error && rows.length === 0 && <div className="empty">{emptyText}</div>}
      </div>
      <div className="dt-foot">
        <label className="dt-size">
          Hiển thị
          <select className="select" value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1) }} aria-label={`Số ${itemLabel} mỗi trang`}>
            {pageSizes.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          {itemLabel} mỗi trang
        </label>
        <span className="dt-range">{from}-{to} / {sorted.length}</span>
        <nav className="dt-pages" aria-label="Phân trang">
          <button type="button" className="pg" onClick={() => setPage(1)} disabled={cur <= 1} aria-label="Trang đầu">«</button>
          <button type="button" className="pg" onClick={() => setPage(cur - 1)} disabled={cur <= 1} aria-label="Trang trước">‹</button>
          {pageButtons(cur, pages).map((n, i, arr) => (
            <span key={n} className="pg-wrap">
              {i > 0 && n - arr[i - 1] > 1 && <span className="pg-gap">…</span>}
              <button type="button" className="pg" aria-current={n === cur ? 'page' : undefined} onClick={() => setPage(n)}>{n}</button>
            </span>
          ))}
          <button type="button" className="pg" onClick={() => setPage(cur + 1)} disabled={cur >= pages} aria-label="Trang sau">›</button>
          <button type="button" className="pg" onClick={() => setPage(pages)} disabled={cur >= pages} aria-label="Trang cuối">»</button>
        </nav>
      </div>
    </div>
  )
}
