import assert from "node:assert/strict"
import test from "node:test"
import { resetCountdown } from "../src/countdown.ts"

const minute = 60_000

test("unknown reset remains explicitly unknown", () => {
  assert.equal(resetCountdown(null, 0), "reset: unknown")
})

test("sub-minute countdown is compact and never rounds up to a minute", () => {
  assert.equal(resetCountdown(59_999, 0), "reset <1m")
})

test("formats minute, hour, and day scales", () => {
  assert.equal(resetCountdown(15 * minute, 0), "reset in 15m")
  assert.equal(resetCountdown((2 * 60 + 15) * minute, 0), "reset in 2h 15m")
  assert.equal(resetCountdown((24 * 60 + 3 * 60) * minute, 0), "reset in 1d 3h")
})

test("past reset waits for new server data instead of claiming a reset", () => {
  assert.equal(resetCountdown(0, 1), "ожидание обновления")
  assert.equal(resetCountdown(1_000, 1_000), "ожидание обновления")
})
