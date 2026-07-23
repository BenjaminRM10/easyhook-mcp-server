import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadConfig } from "../dist/config.js";
import { createServer } from "../dist/server.js";

test("negotiates MCP and exposes the restricted tool set", async () => {
  const server = createServer(loadConfig({
    EASYHOOK_API_KEY: "eh_live_test",
    EASYHOOK_FROM: "5218661479075",
    EASYHOOK_ALLOWED_TO: "5215660069997",
  }));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "easyhook-mcp-test", version: "1.0.0" });

  await server.connect(serverTransport);
  try {
    await client.connect(clientTransport);
    const response = await client.listTools();
    assert.deepEqual(
      response.tools.map((tool) => tool.name).sort(),
      [
        "get_recent_messages",
        "list_contacts",
        "list_conversations",
        "list_flows",
        "list_media",
        "list_templates",
        "send_consent_flow",
        "send_flow",
        "send_media",
        "send_template",
        "send_text",
      ],
    );
    const denied = await client.callTool({
      name: "send_text",
      arguments: { to: "528442461514", body: "blocked" },
    });
    assert.equal(denied.isError, true);
    assert.match(JSON.stringify(denied.content), /recipient_not_allowed/);
  } finally {
    await client.close();
    await server.close();
  }
});

test("only exposes conversation data for allowlisted contacts", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/v1/conversations") {
      return new Response(JSON.stringify({
        from: "5218661479075",
        conversations: [
          { contact: { phone: "5215660069997", name: "Allowed" }, last_message: { text: "ok" } },
          { contact: { phone: "528442461514", name: "Private" }, last_message: { text: "hidden" } },
        ],
        pagination: { has_more: false, next_cursor: null },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.pathname === "/v1/conversations/5215660069997/messages") {
      return new Response(JSON.stringify({ contact: "5215660069997", messages: [{ direction: "in", text: "reply" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
  };

  const server = createServer(loadConfig({
    EASYHOOK_API_KEY: "eh_live_test",
    EASYHOOK_FROM: "5218661479075",
    EASYHOOK_CONTACTS: JSON.stringify([
      { phone: "5215660069997", name: "Tram", description: "QA recipient" },
    ]),
  }));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "easyhook-mcp-test", version: "1.0.0" });

  await server.connect(serverTransport);
  try {
    await client.connect(clientTransport);
    const contacts = await client.callTool({ name: "list_contacts", arguments: {} });
    assert.match(JSON.stringify(contacts.content), /Tram/);
    assert.match(JSON.stringify(contacts.content), /QA recipient/);

    const conversations = await client.callTool({ name: "list_conversations", arguments: {} });
    assert.match(JSON.stringify(conversations.content), /Allowed/);
    assert.match(JSON.stringify(conversations.content), /configured_name/);
    assert.doesNotMatch(JSON.stringify(conversations.content), /Private|hidden/);

    const messages = await client.callTool({ name: "get_recent_messages", arguments: { contact: "Tram" } });
    assert.match(JSON.stringify(messages.content), /reply/);

    const denied = await client.callTool({ name: "get_recent_messages", arguments: { contact: "528442461514" } });
    assert.equal(denied.isError, true);
    assert.match(JSON.stringify(denied.content), /recipient_not_allowed/);
  } finally {
    await client.close();
    await server.close();
    globalThis.fetch = originalFetch;
  }
});
