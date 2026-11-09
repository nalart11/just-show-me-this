import { Rpc } from '@opencode/plugin/rpc'

export const CodexLimits = Rpc.define({
  id: 'codex-limits',
  methods: {
    status: {
      // 2.2.6 requires an input schema (newer docs permit omission).
      input: {
        '~standard': {
          version: 1,
          vendor: 'codex-limits',
          types: undefined as { input: void; output: void } | undefined,
          validate: (value: unknown) => value === undefined || value === null
            ? { value: undefined }
            : { issues: [{ message: 'This method takes no input' }] },
        },
      },
      output: {
        type: 'object', additionalProperties: false,
        required: ['state', 'windows', 'message', 'updatedAt'],
        properties: {
          state: { type: 'string', enum: ['ready', 'unavailable', 'error'] },
          message: { type: 'string' },
          updatedAt: { type: ['number', 'null'] },
          windows: {
            type: 'array', items: {
              type: 'object', additionalProperties: false,
              required: ['label', 'remainingPercent', 'resetAt'],
              properties: {
                label: { type: 'string' },
                remainingPercent: { type: 'number', minimum: 0, maximum: 100 },
                resetAt: { type: ['number', 'null'] },
              },
            },
          },
        },
      },
    },
  },
  events: {},
})
