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
        "check_template_category",
        "create_onboarding_url",
        "create_template",
        "get_recent_messages",
        "list_contacts",
        "list_conversations",
        "list_flows",
        "list_media",
        "list_templates",
        "mark_message_read",
        "react_to_message",
        "reply_to_message",
        "send_consent_flow",
        "send_flow",
        "send_interactive",
        "send_media",
        "send_onboarding_link",
        "send_template",
        "send_text",
        "show_typing",
        "wait_for_message",
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
    if (url.pathname === "/v1/conversations/5215660069997/messages/wait") {
      return new Response(JSON.stringify({
        contact: "5215660069997",
        timed_out: false,
        messages: [{ id: "wamid.next", direction: "in", type: "text", text: "next instruction" }],
      }), { status: 200, headers: { "content-type": "application/json" } });
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

    const waited = await client.callTool({
      name: "wait_for_message",
      arguments: { contact: "Tram", after_id: "wamid.previous", timeout_seconds: 30 },
    });
    assert.match(JSON.stringify(waited.content), /next instruction/);

    const denied = await client.callTool({ name: "get_recent_messages", arguments: { contact: "528442461514" } });
    assert.equal(denied.isError, true);
    assert.match(JSON.stringify(denied.content), /recipient_not_allowed/);
  } finally {
    await client.close();
    await server.close();
    globalThis.fetch = originalFetch;
  }
});

test("organization mode reads unregistered contacts and sends only through the fixed sender", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    requests.push({ url, init });
    if (url.pathname === "/v1/senders") return Response.json({ senders: [{ account_id: "5218661479075" }] });
    if (url.pathname === "/v1/senders/5218661479075/health") return Response.json({ health: { status: "connected" } });
    if (url.pathname === "/v1/conversations") return Response.json({
      conversations: [
        { contact: { phone: "5215660069997" }, last_message: { text: "First" } },
        { contact: { phone: "528442461514" }, last_message: { text: "Second" } },
      ],
    });
    if (url.pathname === "/v1/conversations/528442461514/messages") {
      return Response.json({ messages: [{ id: "wamid.test", text: "Hello" }] });
    }
    if (url.pathname === "/v1/messages/text") return Response.json({ id: "wamid.sent" });
    return Response.json({ error: "not_found" }, { status: 404 });
  };

  const server = createServer(loadConfig({
    EASYHOOK_API_KEY: "eh_live_test",
    EASYHOOK_FROM: "5218661479075",
    EASYHOOK_CONTACT_ACCESS: "organization",
    EASYHOOK_CONTACTS: '[{"phone":"5215660069997","name":"Tram","description":"QA"}]',
  }));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "easyhook-mcp-test", version: "1.0.0" });

  await server.connect(serverTransport);
  try {
    await client.connect(clientTransport);
    const tools = await client.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === "list_senders"));
    assert.ok(tools.tools.some((tool) => tool.name === "get_sender_health"));
    const contacts = await client.callTool({ name: "list_contacts", arguments: {} });
    assert.equal(JSON.parse(contacts.content[0].text).contact_access, "organization");
    const senders = await client.callTool({ name: "list_senders", arguments: {} });
    assert.match(JSON.stringify(senders.content), /5218661479075/);
    const health = await client.callTool({ name: "get_sender_health", arguments: {} });
    assert.match(JSON.stringify(health.content), /connected/);
    const conversations = await client.callTool({ name: "list_conversations", arguments: {} });
    assert.match(JSON.stringify(conversations.content), /First/);
    assert.match(JSON.stringify(conversations.content), /Second/);
    assert.match(JSON.stringify(conversations.content), /configured_name/);
    const messages = await client.callTool({ name: "get_recent_messages", arguments: { contact: "+52 844 246 1514" } });
    assert.match(JSON.stringify(messages.content), /wamid.test/);
    const sent = await client.callTool({ name: "send_text", arguments: { to: "+52 844 246 1514", body: "Approved test" } });
    assert.equal(sent.isError, undefined);
    assert.match(JSON.stringify(sent.content), /wamid.sent/);
    const sendRequest = requests.find(({ url }) => url.pathname === "/v1/messages/text");
    assert.deepEqual(JSON.parse(sendRequest.init.body), {
      from: "5218661479075",
      to: "528442461514",
      body: "Approved test",
    });
    assert.ok(requests.every(({ init }) => init.headers.Authorization === "Bearer eh_live_test"));
  } finally {
    await client.close();
    await server.close();
    globalThis.fetch = originalFetch;
  }
});
