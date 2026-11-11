let cached: string | null | undefined
let pending: Promise<string | null> | undefined

export function getVisitorId(): Promise<string | null> {
  if (cached !== undefined) return Promise.resolve(cached)
  pending ??= import('@fingerprintjs/fingerprintjs')
    .then((m) => m.load())
    .then((a) => a.get())
    .then((r) => r.visitorId)
    .catch(() => null)
    .then((v) => (cached = v))
  return Promise.race([pending, new Promise<null>((r) => setTimeout(() => r(null), 1000))])
}
