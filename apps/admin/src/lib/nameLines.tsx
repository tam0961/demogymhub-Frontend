export function nameLines(name: string) {
  const w = name.trim().split(/\s+/)
  if (w.length <= 4) return <span className="nm-line">{name.trim()}</span>
  return <><span className="nm-line">{w.slice(0, 4).join(' ')}</span><br />{w.slice(4).join(" ")}</>
}
