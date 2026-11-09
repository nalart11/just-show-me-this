import { Plugin } from "@opencode/plugin/tui"
import { createMemo, createSignal, onCleanup } from "solid-js"
import { CodexLimits } from "./rpc.js"
import type { QuotaStatus, QuotaWindow } from "./status.js"

type ViewState =
  | { kind: "loading" }
  | { kind: "missing"; message: string }
  | { kind: "error"; message: string; updatedAt: number | null }
  | { kind: "ready"; windows: QuotaWindow[]; updatedAt: number | null }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function parseStatus(value: unknown): QuotaStatus | undefined {
  if (!isRecord(value) || !["ready", "unavailable", "error"].includes(String(value.state))) return
  if (!Array.isArray(value.windows) || typeof value.message !== "string") return
  const updatedAt = value.updatedAt === null ? null : value.updatedAt
  if (updatedAt !== null && (typeof updatedAt !== "number" || !Number.isFinite(updatedAt))) return
  const windows: QuotaWindow[] = []
  for (const raw of value.windows) {
    if (!isRecord(raw) || typeof raw.label !== "string" || !raw.label.trim()) return
    if (typeof raw.remainingPercent !== "number" || !Number.isFinite(raw.remainingPercent)) return
    if (raw.resetAt !== null && (typeof raw.resetAt !== "number" || !Number.isFinite(raw.resetAt))) return
    windows.push({ label: raw.label, remainingPercent: Math.max(0, Math.min(100, raw.remainingPercent)), resetAt: raw.resetAt as number | null })
  }
  return { state: value.state as QuotaStatus["state"], windows, message: value.message, updatedAt }
}

function resetLabel(timestamp: number | null): string {
  if (timestamp === null) return "время сброса неизвестно"
  try {
    return `сброс ${new Intl.DateTimeFormat("ru", { dateStyle: "short", timeStyle: "short" }).format(timestamp)}`
  } catch {
    return "время сброса неизвестно"
  }
}

function updatedLabel(timestamp: number | null): string {
  if (timestamp === null) return "Время обновления неизвестно"
  const age = Math.max(0, Date.now() - timestamp)
  const stale = age > 120_000
  const minutes = Math.floor(age / 60_000)
  const ageText = minutes < 1 ? "только что" : `${minutes} мин. назад`
  return `${stale ? "Устаревшие данные" : "Обновлено"}: ${ageText}`
}

export default Plugin.define({
  id: "codex-limits.tui",
  setup(context) {
    let disposed = false
    let inFlight: Promise<void> | undefined
    let state: ViewState = { kind: "loading" }
    const listeners = new Set<() => void>()
    const notify = () => listeners.forEach((listener) => listener())

    const refresh = (): Promise<void> => {
      if (disposed) return Promise.resolve()
      if (inFlight) return inFlight
      inFlight = (async () => {
       try {
        const response = await context.client.rpc(CodexLimits).status()
        if (disposed) return
        const status = parseStatus(response)
        if (!status) {
          state = { kind: "error", message: "Получен ответ неизвестного формата", updatedAt: null }
        } else if (status.state === "unavailable") {
          state = { kind: "missing", message: status.message }
        } else if (status.state === "error") {
          state = { kind: "error", message: status.message || "Не удалось получить лимиты", updatedAt: status.updatedAt }
        } else {
          state = { kind: "ready", windows: status.windows, updatedAt: status.updatedAt }
        }
        notify()
      } catch {
        if (!disposed) {
          state = { kind: "error", message: "Не удалось связаться с сервером", updatedAt: null }
          notify()
        }
       }
      })().finally(() => { inFlight = undefined })
      return inFlight
    }

    const render = () => {
      const theme = context.theme
      if (state.kind === "loading") return <text fg={theme.text.muted}>Codex · загрузка</text>
      if (state.kind === "missing") return <text fg={theme.text.muted}>Codex · недоступно</text>
      if (state.kind === "error") return <text fg={theme.warning}>Codex · данные недоступны</text>
      if (!state.windows.length) return <text fg={theme.text.muted}>Codex · нет данных о квотах</text>
      return <text fg={state.windows.some((window) => window.remainingPercent <= 10) ? theme.warning : theme.text.muted}>Codex · {state.windows.map((window) => `${window.label} ${Math.round(window.remainingPercent)}%`).join(" · ")}</text>
    }

    const registerSlot = (placement: "home.footer.status" | "prompt.footer.status") =>
      context.ui.slot({ append: placement, render: () => {
        // Keep the slot reactive without replacing or expanding the host footer.
        return <StatusView subscribe={(listener) => { listeners.add(listener); return () => listeners.delete(listener) }} render={render} />
      } })

    const showDetails = async () => {
      await refresh()
      if (disposed) return
      const message = state.kind === "loading"
        ? "Загрузка данных о лимитах…"
        : state.kind === "missing"
          ? state.message || "Данные о квотах недоступны. Проверьте авторизацию Codex и настройки доступа."
          : state.kind === "error"
            ? `Лимиты сейчас недоступны.\n${state.message}${state.updatedAt ? `\n${updatedLabel(state.updatedAt)}` : ""}`
            : state.windows.length
              ? `${state.windows.map((window) => `${window.label}: ${Math.round(window.remainingPercent)}% осталось · ${resetLabel(window.resetAt)}`).join("\n")}\n${updatedLabel(state.updatedAt)}`
              : "Нет данных о квотах."
      await context.ui.dialog.alert({ title: "Лимиты Codex", message })
    }

    const stopHome = registerSlot("home.footer.status")
    const stopPrompt = registerSlot("prompt.footer.status")
    context.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "codex-limits.tui.show",
        title: "Показать лимиты Codex",
        group: "Codex Limits",
        slash: { name: "codex-limits" },
        palette: true,
        enabled: () => true,
        run: () => showDetails(),
      }],
    }))
    void refresh()
    const timer = setInterval(() => { void refresh() }, 60_000)
    return () => {
      disposed = true
      clearInterval(timer)
      stopHome()
      stopPrompt()
      listeners.clear()
    }
  },
})

function StatusView(props: { subscribe: (listener: () => void) => () => void; render: () => unknown }) {
  // Read the revision reactively, but render only the status text.
  const [revision, setRevision] = createSignal(0)
  onCleanup(props.subscribe(() => setRevision((value) => value + 1)))
  const view = createMemo(() => {
    revision()
    return props.render()
  })
  return <>{view() as any}</>
}
