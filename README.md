# Easyhook MCP Server

Use Easyhook from Codex, Claude, and other Model Context Protocol clients. The server fixes one Easyhook sender and only permits reading from or writing to contacts explicitly listed at startup. Contacts include a name and description so the agent knows who it can contact and when.

## Security model

- `EASYHOOK_API_KEY` is read from the MCP process environment and is never accepted as a tool argument.
- `EASYHOOK_FROM` fixes the sender for every operation.
- `EASYHOOK_CONTACTS` is a required JSON contact list. Every send and message read is checked locally.
- There is no unrestricted HTTP tool and no tenant administration tool.
- Keep the API key outside prompts, repositories, and workflow inputs.

## Install in Codex

```bash
codex mcp add easyhook \
  --env EASYHOOK_API_KEY=eh_live_xxx \
  --env EASYHOOK_FROM=5218661479075 \
  --env EASYHOOK_CONTACTS='[{"phone":"5215660069997","name":"Tram","description":"QA contact; use only for requested tests"}]' \
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
EASYHOOK_CONTACTS = "[{\"phone\":\"5215660069997\",\"name\":\"Tram\",\"description\":\"QA contact; use only for requested tests\"}]"
```

Restart the MCP client after changing configuration.

## Optional configuration

| Variable | Required | Description |
| --- | --- | --- |
| `EASYHOOK_API_KEY` | Yes | Easyhook organization API key. |
| `EASYHOOK_FROM` | Yes | Fixed Easyhook WhatsApp sender. Formatted numbers are normalized to digits. |
| `EASYHOOK_CONTACTS` | Yes | JSON array of `{ phone, name, description }` contacts the agent may read or message. |
| `EASYHOOK_ALLOWED_TO` | Legacy | Comma-separated phone allowlist used only when `EASYHOOK_CONTACTS` is absent. |
| `EASYHOOK_BASE_URL` | No | API origin. Defaults to `https://api.easyhook.dev`. |

## Tools

| Tool | Purpose |
| --- | --- |
| `list_contacts` | List permitted contacts with their names and usage descriptions. |
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

Conversation tools always use `EASYHOOK_FROM`. Send and read tools accept either a configured contact name or its phone. `get_recent_messages` rejects contacts outside `EASYHOOK_CONTACTS`; `list_conversations` removes other contacts before returning data to the MCP client.

Easyhook service-window, consent, wallet, template, and Meta policy checks still apply.

## Development

```bash
npm ci
npm test
npm run typecheck
npm pack --dry-run
```
