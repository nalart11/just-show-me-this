# OpenCode Codex Limits

See your remaining ChatGPT subscription quotas directly in the OpenCode terminal UI.
Built for OpenCode **2.2.6 (V2)**. OpenCode V1 is not supported.

## Installation

Clone the repository and install its dependencies:

```sh
git clone https://github.com/nalart11/just-show-me-this.git
cd just-show-me-this
npm ci
```

Add the **absolute path** to the cloned directory to the existing `plugins` array
in `~/.config/opencode/opencode.jsonc`, preserving your other settings:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/to/just-show-me-this"]
}
```

OpenCode automatically reloads configuration changes. Run `/reload` if needed.
The plugin itself does not modify your OpenCode configuration.

Connect an OpenAI account with a ChatGPT subscription **in OpenCode**.
An API key or a separate Codex CLI login does not replace this connection.

## Usage

A compact indicator appears in the home-screen footer and the prompt footer.
Each quota window also shows a countdown to its reset time. Unknown reset times
are marked as unknown; an elapsed reset time is shown as awaiting an update,
not as a confirmed quota refill.
Run `/codex-limits` to see the available quota windows, remaining percentages,
and reset times. The plugin polls every minute; server-side caching means the
command does not bypass that refresh interval.

The indicator shows **remaining quota percentages**, not a count of available
messages or tokens. It covers the main Codex windows (`rate_limit`), not credit
balances, code-review quotas, or additional model-specific limits.
Missing data is never treated as a full quota. If authorization fails, reconnect
your account through OpenCode.

The current interface messages are in Russian.

## Security and limitations

- The server retrieves credentials through OpenCode's integration API.
- Tokens are not sent to the TUI or written to files by the plugin.
- Quota requests go only to `https://chatgpt.com/backend-api/wham/usage`;
  redirects are rejected.
- This is an internal ChatGPT endpoint used by Codex. Its availability and
  response format are not guaranteed and may change.
- Service errors, rate limiting, and missing data are displayed as unavailable,
  not as an empty or full quota.
- The plugin does not call a model or estimate quotas from session costs.

## Development

Use Node.js 22.18+ (or a newer release with built-in TypeScript stripping) and npm.

```sh
npm ci
npm test
npm run typecheck
```

Tests use mocked responses and do not access an account. Tests and type checks
do not replace visual verification in a running TUI or checking the live service
response for your subscription.

## License

[MIT](LICENSE) — free to use, modify, distribute, and use commercially,
subject to the license notice requirements. Provided without warranty.
