import { Plugin } from '@opencode/plugin'
import { CodexLimits } from './rpc.ts'
import { createQuotaService } from './quota.ts'

export default Plugin.define({
  id: 'codex-limits',
  async setup(ctx) {
    const quota = createQuotaService(ctx.integration.connection)
    await ctx.rpc.register(CodexLimits, { status: () => quota.status() })
  },
})
