import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createQuotaService, parseWindows } from '../src/quota.ts'

const payload = { rate_limit: { primary_window: { used_percent: 25, limit_window_seconds: 18000, reset_at: 1800000000 }, secondary_window: { used_percent: 100, limit_window_seconds: 604800, reset_at: null } } }
const auth = { active: async (id: string) => { assert.equal(id, 'openai'); return { id: 'mock' } }, resolve: async () => ({ type: 'oauth', access: 'mock-secret', expires: 9000000000000, metadata: { accountID: 'mock-account' } }) }
test('parses real schema percentages, seconds to milliseconds, and absent reset', () => {
  assert.deepEqual(parseWindows(payload), [
    { label: '5h', remainingPercent: 75, resetAt: 1800000000000 },
    { label: '7d', remainingPercent: 0, resetAt: null },
  ])
})
test('unknown and invalid windows never imply 100%', () => {
  for (const value of [null, {}, { rate_limit: {} }, { rate_limit: { primary_window: {} } },
    ...[-1, 101, '25', NaN].map(used_percent => ({ rate_limit: { primary_window: { ...payload.rate_limit.primary_window, used_percent } } }))]) {
    assert.throws(() => parseWindows(value))
  }
})
test('auth resolver, fixed GET, deduplication and 60 second cache', async () => {
  let calls = 0, now = 0
  const service = createQuotaService(auth, { now: () => now, fetch: async (url, init) => {
    calls++
    assert.equal(url, 'https://chatgpt.com/backend-api/wham/usage')
    assert.equal(init?.method, 'GET'); assert.equal(init?.redirect, 'error')
    assert.ok(init?.signal)
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer mock-secret')
    assert.equal((init?.headers as Record<string, string>)['ChatGPT-Account-Id'], 'mock-account')
    return Response.json(payload)
  } })
  const results = await Promise.all([service.status(), service.status()])
  assert.equal(results[0].state, 'ready'); assert.equal(calls, 1)
  await service.status(); assert.equal(calls, 1)
  now = 60001; await service.status(); assert.equal(calls, 2)
})
test('expired or unknown-expiry resolved OAuth credentials never fetch', async () => {
  for (const expires of [undefined, null, NaN, 999, 1000]) {
    let calls = 0
    const service = createQuotaService({ active: async () => ({}), resolve: async () => ({ type: 'oauth', access: 'mock-secret', expires }) }, {
      now: () => 1000,
      fetch: async () => { calls++; return Response.json(payload) },
    })
    assert.equal((await service.status()).state, 'unavailable')
    assert.equal(calls, 0)
  }
})
test('missing or non-OAuth credentials do not fetch', async () => {
  for (const credential of [undefined, { type: 'key', key: 'mock' }, { type: 'oauth', access: '' }]) {
    const service = createQuotaService({ active: async () => ({}), resolve: async () => credential }, { fetch: async () => { throw new Error('must not fetch') } })
    assert.equal((await service.status()).state, 'unavailable')
  }
})
test('HTTP failures have safe messages and cooldowns', async () => {
  for (const code of [401, 403, 429, 500, 503]) {
    let calls = 0
    const service = createQuotaService(auth, { fetch: async () => { calls++; return new Response('mock-secret', { status: code }) } })
    const result = await service.status()
    assert.equal(result.state, code === 401 || code === 403 ? 'unavailable' : 'error')
    assert.deepEqual(result.windows, []); assert.equal(result.updatedAt, null)
    assert.ok(!JSON.stringify(result).includes('mock-secret'))
    await service.status(); assert.equal(calls, 1)
  }
})
test('invalid JSON, invalid windows, network and resolver failures are sanitized', async () => {
  for (const fetcher of [async () => new Response('{'), async () => Response.json({}), async () => { throw Error('mock-secret') }]) {
    const result = await createQuotaService(auth, { fetch: fetcher }).status()
    assert.equal(result.state, 'error'); assert.ok(!JSON.stringify(result).includes('mock-secret'))
  }
  const result = await createQuotaService({ active: async () => { throw Error('mock-secret') }, resolve: async () => undefined }).status()
  assert.equal(result.state, 'error'); assert.ok(!JSON.stringify(result).includes('mock-secret'))
})
