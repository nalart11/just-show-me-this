/** Describe a quota window's reset without implying anything about its quota afterward. */
export function resetCountdown(resetAt: number | null, now = Date.now()): string {
  if (resetAt === null || !Number.isFinite(resetAt)) return "reset: unknown"
  if (!Number.isFinite(now) || resetAt <= now) return "ожидание обновления"

  const remaining = resetAt - now
  if (remaining < 60_000) return "reset <1m"

  const minutes = Math.floor(remaining / 60_000)
  const days = Math.floor(minutes / (24 * 60))
  const hours = Math.floor((minutes % (24 * 60)) / 60)
  const mins = minutes % 60
  if (days > 0) return `reset in ${days}d ${hours}h`
  if (hours > 0) return `reset in ${hours}h ${mins}m`
  return `reset in ${mins}m`
}
