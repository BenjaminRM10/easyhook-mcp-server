import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EasyhookApiError, EasyhookClient } from "./client.js";
import { requireAllowedRecipient, type EasyhookConfig } from "./config.js";

const mediaType = z.enum(["image", "video", "audio", "document", "sticker"]);

export function createServer(config: EasyhookConfig): McpServer {
  const client = new EasyhookClient(config);
  const server = new McpServer({ name: "easyhook", version: "0.2.1" });

  server.registerTool(
    "list_conversations",
    {
      title: "List Easyhook conversations",
      description: "List recent WhatsApp conversations for the configured sender. Only contacts in EASYHOOK_ALLOWED_TO are returned.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).default(20),
        before: z.string().optional().describe("ISO 8601 cursor from a previous response."),
      }),
    },
    async ({ limit, before }) => execute(async () => {
      const response = await client.get("/v1/conversations", compactStrings({
        from: config.from,
        limit: "100",
        before,
      }));
      return filterAllowedConversations(response, config.allowedTo, limit);
    }),
  );

  server.registerTool(
    "get_recent_messages",
    {
      title: "Get recent Easyhook messages",
      description: "Read recent inbound and outbound WhatsApp messages with one allowlisted contact.",
      inputSchema: z.object({
        contact: z.string().describe("Contact phone. Must be in EASYHOOK_ALLOWED_TO."),
        limit: z.number().int().min(1).max(100).default(50),
        before: z.string().optional().describe("ISO 8601 cursor from a previous response."),
      }),
    },
    async ({ contact, limit, before }) => execute(async () => {
      const allowedContact = requireAllowedRecipient(config, contact);
      return client.get(`/v1/conversations/${encodeURIComponent(allowedContact)}/messages`, compactStrings({
        from: config.from,
        limit: String(limit),
        before,
      }));
    }),
  );

  server.registerTool(
    "send_text",
    {
      title: "Send Easyhook text",
      description: "Send an immediate, scheduled, or humanized text message to an allowlisted phone.",
      inputSchema: z.object({
        to: z.string().describe("Destination phone. Must be in EASYHOOK_ALLOWED_TO."),
        body: z.string().min(1).describe("Text to send."),
        delivery: z.enum(["standard", "humanized"]).default("standard"),
        at: z.string().optional().describe("ISO 8601 schedule time. Standard delivery only."),
        message_id: z.string().optional().describe("Inbound WhatsApp wamid used by humanized delivery."),
      }),
    },
    async ({ to, body, delivery, at, message_id }) => execute(async () => {
      const recipient = requireAllowedRecipient(config, to);
      if (delivery === "humanized" && at) throw new Error("humanized_delivery_cannot_be_scheduled");
      const path = delivery === "humanized" ? "/v1/messages/humanized-text" : "/v1/messages/text";
      return client.post(path, compact({ from: config.from, to: recipient, body, at, message_id }));
    }),
  );

  server.registerTool(
    "send_media",
    {
      title: "Send Easyhook media",
      description: "Send reusable Easyhook media, a Meta media id, or a public media link to an allowlisted phone.",
      inputSchema: z.object({
        to: z.string(),
        type: mediaType,
        media_name: z.string().optional(),
        id: z.string().optional(),
        link: z.string().url().optional(),
        caption: z.string().optional(),
        filename: z.string().optional(),
        at: z.string().optional().describe("ISO 8601 schedule time."),
      }),
    },
    async ({ to, type, media_name, id, link, caption, filename, at }) => execute(async () => {
      const recipient = requireAllowedRecipient(config, to);
      if ([media_name, id, link].filter(Boolean).length !== 1) {
        throw new Error("Provide exactly one of media_name, id, or link");
      }
      return client.post("/v1/messages/media", compact({
        from: config.from,
        to: recipient,
        type,
        media_name,
        id,
        link,
        caption,
        filename,
        at,
      }));
    }),
  );

  server.registerTool(
    "send_template",
    {
      title: "Send Easyhook template",
      description: "Send an approved WhatsApp template to an allowlisted phone.",
      inputSchema: z.object({
        to: z.string(),
        template_name: z.string().min(1),
        language: z.string().optional().describe("Template language such as es_MX or en_US."),
        parameters: z.record(z.string(), z.unknown()).optional().describe("Friendly header/body template variables."),
        components: z.array(z.record(z.string(), z.unknown())).optional().describe("Raw Meta components. Overrides parameters."),
        at: z.string().optional().describe("ISO 8601 schedule time."),
      }),
    },
    async ({ to, template_name, language, parameters, components, at }) => execute(async () => {
      const recipient = requireAllowedRecipient(config, to);
      return client.post("/v1/messages/template", compact({
        from: config.from,
        to: recipient,
        template: compact({ name: template_name, language }),
        parameters,
        components,
        at,
      }));
    }),
  );

  server.registerTool(
    "send_flow",
    {
      title: "Send Easyhook Flow",
      description: "Send a published WhatsApp Flow to an allowlisted phone inside the service window.",
      inputSchema: z.object({
        to: z.string(),
        flow_reference: z.string().min(1),
        flow_reference_type: z.enum(["name", "meta_id", "local_id"]).default("name"),
        body: z.string().min(1),
        cta: z.string().min(1),
        flow_token: z.string().optional(),
        footer: z.string().optional(),
        flow_action_payload: z.record(z.string(), z.unknown()).optional(),
      }),
    },
    async ({ to, flow_reference, flow_reference_type, body, cta, flow_token, footer, flow_action_payload }) => execute(async () => {
      const recipient = requireAllowedRecipient(config, to);
      const referenceKey = flow_reference_type === "meta_id"
        ? "flow_id"
        : flow_reference_type === "local_id" ? "flow_local_id" : "flow_name";
      return client.post("/v1/messages/flow", compact({
        from: config.from,
        to: recipient,
        [referenceKey]: flow_reference,
        body,
        cta,
        flow_token,
        footer,
        flow_action_payload,
      }));
    }),
  );

  server.registerTool(
    "send_consent_flow",
    {
      title: "Send Easyhook consent Flow",
      description: "Send the WABA default opt-in or opt-out Flow to an allowlisted phone.",
      inputSchema: z.object({
        to: z.string(),
        mode: z.enum(["opt_in", "opt_out"]),
      }),
    },
    async ({ to, mode }) => execute(async () => client.post("/v1/consent/send-flow", {
      from: config.from,
      to: requireAllowedRecipient(config, to),
      mode,
    })),
  );

  server.registerTool(
    "list_templates",
    {
      title: "List Easyhook templates",
      description: "List templates belonging to the WABA resolved from the configured sender.",
      inputSchema: z.object({}),
    },
    async () => execute(async () => client.get("/v1/templates", { from: config.from })),
  );

  server.registerTool(
    "list_media",
    {
      title: "List Easyhook media",
      description: "List reusable media belonging to the WABA resolved from the configured sender.",
      inputSchema: z.object({}),
    },
    async () => execute(async () => client.get("/v1/media", { from: config.from })),
  );

  server.registerTool(
    "list_flows",
    {
      title: "List Easyhook Flows",
      description: "List WhatsApp Flows belonging to the WABA resolved from the configured sender.",
      inputSchema: z.object({}),
    },
    async () => execute(async () => client.get("/v1/flows", { from: config.from })),
  );

  return server;
}

async function execute(operation: () => Promise<unknown>) {
  try {
    const result = await operation();
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    const detail = error instanceof EasyhookApiError
      ? { error: error.message, status: error.status, response: error.payload }
      : { error: error instanceof Error ? error.message : String(error) };
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify(detail, null, 2) }],
    };
  }
}

function compact(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function compactStrings(input: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(Object.entries(input).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== ""));
}

function filterAllowedConversations(response: unknown, allowedTo: ReadonlySet<string>, limit: number): unknown {
  if (!isRecord(response) || !Array.isArray(response.conversations)) return response;
  const conversations = response.conversations
    .filter((conversation) => {
      if (!isRecord(conversation) || !isRecord(conversation.contact)) return false;
      const phone = typeof conversation.contact.phone === "string" ? conversation.contact.phone.replace(/\D/g, "") : "";
      return allowedTo.has(phone);
    })
    .slice(0, limit);
  return { ...response, conversations };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
