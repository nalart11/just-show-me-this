import type { QuotaStatus, QuotaWindow } from './status.ts'

const ENDPOINT = 'https://chatgpt.com/backend-api/wham/usage'
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/** The ordinary Codex rate_limit windows, not credits or code-review allowances. */
export function parseWindows(payload: unknown): QuotaWindow[] {
  if (!record(payload) || !record(payload.rate_limit)) throw new Error('Invalid usage')
  const windows: QuotaWindow[] = []
  for (const [key, fallback] of [['primary_window', 'Primary'], ['secondary_window', 'Secondary']] as const) {
    const value = payload.rate_limit[key]
    if (value == null) continue
    if (!record(value) || !finite(value.used_percent) || value.used_percent < 0 || value.used_percent > 100 ||
      !finite(value.limit_window_seconds) || value.limit_window_seconds <= 0) throw new Error('Invalid window')
    let resetAt: number | null = null
    if (value.reset_at != null) {
      if (!finite(value.reset_at) || value.reset_at < 0 || !Number.isSafeInteger(value.reset_at * 1000)) throw new Error('Invalid reset')
      resetAt = value.reset_at * 1000
    }
    const seconds = value.limit_window_seconds
    const label = seconds % 86400 === 0 ? `${seconds / 86400}d` : seconds % 3600 === 0 ? `${seconds / 3600}h` : fallback
    windows.push({ label, remainingPercent: 100 - value.used_percent, resetAt })
  }
  if (!windows.length) throw new Error('Missing windows')
  return windows
}

export type AuthConnection = {
  active(integrationID: string): Promise<unknown>
  resolve(connection: never): Promise<unknown>
}

export function createQuotaService(auth: AuthConnection, options: { fetch?: typeof fetch; now?: () => number; timeoutMs?: number } = {}) {
  const request = options.fetch ?? fetch
  const now = options.now ?? Date.now
  let cached: QuotaStatus | undefined
  let expiresAt = 0
  let pending: Promise<QuotaStatus> | undefined
  const status = (state: QuotaStatus['state'], message: string): QuotaStatus => ({ state, message, windows: [], updatedAt: null })
  async function load(): Promise<QuotaStatus> {
    try {
      const connection = await auth.active('openai')
      const credential = connection ? await auth.resolve(connection as never) : undefined
      if (!record(credential) || credential.type !== 'oauth' || typeof credential.access !== 'string' || !credential.access.trim()) {
        return status('unavailable', 'Подключите аккаунт ChatGPT через OpenAI в OpenCode.')
      }
      // resolve owns renewal, but returns unchanged OAuth values when no refresh
      // implementation is registered. Never send an expired/unknown-expiry token.
      if (!finite(credential.expires) || credential.expires <= now()) {
        return status('unavailable', 'Авторизация ChatGPT истекла. Повторно подключите аккаунт в OpenCode.')
      }
      const headers: Record<string, string> = { Authorization: `Bearer ${credential.access}`, Accept: 'application/json' }
      if (record(credential.metadata) && typeof credential.metadata.accountID === 'string') {
        headers['ChatGPT-Account-Id'] = credential.metadata.accountID
      }
      const response = await request(ENDPOINT, {
        method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
      })
      if (!response.ok) {
        // Never read an error body: upstream errors can contain sensitive details.
        void response.body?.cancel().catch(() => {})
        if (response.status === 401 || response.status === 403) return status('unavailable', 'Нет доступа к квотам ChatGPT. Проверьте подключение OpenAI в OpenCode.')
        if (response.status === 429) return status('error', 'Слишком частые запросы квот ChatGPT. Повторите позже.')
        return status('error', 'Данные о квотах ChatGPT временно недоступны.')
      }
      const windows = parseWindows(await response.json())
      return { state: 'ready', windows, message: 'Лимиты ChatGPT Codex', updatedAt: now() }
    } catch {
      return status('error', 'Не удалось получить квоты ChatGPT. Повторите позже.')
    }
  }
  return {
    status(): Promise<QuotaStatus> {
      if (pending) return pending
      if (cached && now() < expiresAt) return Promise.resolve(structuredClone(cached))
      pending = load().then(value => {
        cached = value
        expiresAt = now() + 60_000
        return structuredClone(value)
      }).finally(() => { pending = undefined })
      return pending
    },
  }
}
