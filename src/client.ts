import type { EasyhookConfig } from "./config.js";

export class EasyhookApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: unknown,
  ) {
    super(`Easyhook API request failed with status ${status}`);
    this.name = "EasyhookApiError";
  }
}

export class EasyhookClient {
  constructor(private readonly config: EasyhookConfig) {}

  get(path: string, query?: Record<string, string>): Promise<unknown> {
    const url = new URL(path, this.config.baseUrl);
    for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
    return this.request(url, { method: "GET" });
  }

  post(path: string, body: Record<string, unknown>): Promise<unknown> {
    return this.request(new URL(path, this.config.baseUrl), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  private async request(url: URL, init: RequestInit): Promise<unknown> {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        Accept: "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(30_000),
    });
    const text = await response.text();
    const payload = parseResponse(text);
    if (!response.ok) throw new EasyhookApiError(response.status, payload);
    return payload;
  }
}

function parseResponse(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}
