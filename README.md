# Easyhook MCP Server

Use Easyhook from Codex, Claude, and other Model Context Protocol clients. The server fixes one Easyhook sender and only permits reading from or writing to contacts explicitly listed at startup.

## Security model

- `EASYHOOK_API_KEY` is read from the MCP process environment and is never accepted as a tool argument.
- `EASYHOOK_FROM` fixes the sender for every operation.
- `EASYHOOK_ALLOWED_TO` is a required comma-separated allowlist. Every send and message read is checked locally.
- There is no unrestricted HTTP tool and no tenant administration tool.
- Keep the API key outside prompts, repositories, and workflow inputs.

## Install in Codex

```bash
codex mcp add easyhook \
  --env EASYHOOK_API_KEY=eh_live_xxx \
  --env EASYHOOK_FROM=5218661479075 \
  --env EASYHOOK_ALLOWED_TO=5215660069997,528442461514 \
  -- npx -y easyhook-mcp-server
```

Equivalent `~/.codex/config.toml`:

```toml
[mcp_servers.easyhook]
command = "npx"
args = ["-y", "easyhook-mcp-server"]

[mcp_servers.easyhook.env]
EASYHOOK_API_KEY = "eh_live_xxx"
EASYHOOK_FROM = "5218661479075"
EASYHOOK_ALLOWED_TO = "5215660069997,528442461514"
```

Restart the MCP client after changing configuration.

## Optional configuration

| Variable | Required | Description |
| --- | --- | --- |
| `EASYHOOK_API_KEY` | Yes | Easyhook organization API key. |
| `EASYHOOK_FROM` | Yes | Fixed Easyhook WhatsApp sender. Formatted numbers are normalized to digits. |
| `EASYHOOK_ALLOWED_TO` | Yes | Comma-separated readable and writable contact phone allowlist. |
| `EASYHOOK_BASE_URL` | No | API origin. Defaults to `https://api.easyhook.dev`. |

## Tools

| Tool | Purpose |
| --- | --- |
| `send_text` | Send standard, scheduled, or humanized text. |
| `send_media` | Send media by reusable name, Meta id, or public URL. |
| `send_template` | Send an approved WhatsApp template. |
| `send_flow` | Send a published WhatsApp Flow. |
| `send_consent_flow` | Send the default opt-in or opt-out Flow. |
| `list_templates` | List templates for the configured sender's WABA. |
| `list_media` | List reusable media for the configured sender's WABA. |
| `list_flows` | List Flows for the configured sender's WABA. |
| `list_conversations` | List recent conversations, filtered to allowlisted contacts. |
| `get_recent_messages` | Read inbound and outbound messages with one allowlisted contact. |

Conversation tools always use `EASYHOOK_FROM`. `get_recent_messages` rejects contacts outside `EASYHOOK_ALLOWED_TO`; `list_conversations` removes non-allowlisted contacts before returning data to the MCP client.

Easyhook service-window, consent, wallet, template, and Meta policy checks still apply.

## Development

```bash
npm ci
npm test
npm run typecheck
npm pack --dry-run
```
