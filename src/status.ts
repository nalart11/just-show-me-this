export type QuotaWindow = { label: string; remainingPercent: number; resetAt: number | null }
export type QuotaStatus = {
  state: 'ready' | 'unavailable' | 'error'
  windows: QuotaWindow[]
  message: string
  updatedAt: number | null
}
