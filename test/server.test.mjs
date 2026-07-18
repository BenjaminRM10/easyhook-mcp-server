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
