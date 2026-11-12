import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Avatar } from './ui'

const cache = new Map<string, string>()
const pending = new Map<string, Promise<string | null>>()

export interface PhotoRef { id: string; name: string; has_photo?: boolean; photo_version?: number | null; avatar_url?: string | null }
export const photoKey = (m: Pick<PhotoRef, 'id' | 'photo_version'>) => `${m.id}:${m.photo_version ?? 0}`

export function loadPhoto(m: Pick<PhotoRef, 'id' | 'photo_version'>): Promise<string | null> {
  const key = photoKey(m)
  const hit = cache.get(key)
  if (hit) return Promise.resolve(hit)
  let p = pending.get(key)
  if (!p) {
    p = api.get(`/members/${m.id}/photo`, { responseType: 'blob' })
      .then((r) => {
        const url = URL.createObjectURL(r.data as Blob)
        cache.set(key, url)
        return url
      })
      .catch(() => null)
      .finally(() => pending.delete(key))
    pending.set(key, p)
  }
  return p
}

export function MemberAvatar({ member, size }: { member: PhotoRef; size?: number }) {
  const key = member.has_photo ? photoKey(member) : ''
  const [state, setState] = useState<{ key: string; url: string | null }>({ key: '', url: null })
  useEffect(() => {
    if (!key) return
    let alive = true
    loadPhoto(member).then((url) => { if (alive) setState({ key, url }) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const src = key ? (cache.get(key) ?? (state.key === key ? state.url : null)) : null
  return <Avatar name={member.name} src={src ?? member.avatar_url} size={size} />
}
