const ICONS = {
  today: 'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10',
  access: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  members: 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21a8 8 0 0116 0',
  packages: 'M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8',
  menu: 'M4 6h16M4 12h16M4 18h16',
  contracts: 'M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6',
  payments: 'M3 6h18v12H3zM3 10h18M7 15h3',
  debt: 'M12 3v18M16 7H10a3 3 0 000 6h4a3 3 0 010 6H8',
  shift: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  reports: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  users: 'M9 11a3 3 0 100-6 3 3 0 000 6zM3 20a6 6 0 0112 0M17 8a3 3 0 010 6M21 20a6 6 0 00-4-5.6',
  roles: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  audit: 'M9 4h6M8 2h8v4H8zM6 4H5v18h14V4h-1M9 12h6M9 16h6',
  me: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  closing: 'M5 4h14v16H5zM9 8h6M9 12h6M9 16h3',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5',
  down: 'M6 9l6 6 6-6',
  right: 'M9 6l6 6-6 6',
  close: 'M6 6l12 12M18 6L6 18',
  checkin: 'M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M15 12H3',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
} as const

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 20 }: { name: IconName | (string & {}); size?: number }) {
  const d = (ICONS as Record<string, string>)[name] ?? ''
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  )
}
