export interface EasyhookConfig {
  apiKey: string;
  from: string;
  allowedTo: ReadonlySet<string>;
  baseUrl: string;
}

export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): EasyhookConfig {
  const apiKey = required(env, "EASYHOOK_API_KEY");
  const from = normalizePhone(required(env, "EASYHOOK_FROM"));
  const allowedTo = new Set(
    required(env, "EASYHOOK_ALLOWED_TO")
      .split(",")
      .map(normalizePhone)
      .filter(Boolean),
  );

  if (!from) throw new Error("EASYHOOK_FROM must contain a phone number");
  if (allowedTo.size === 0) {
    throw new Error("EASYHOOK_ALLOWED_TO must contain at least one phone number");
  }

  return {
    apiKey,
    from,
    allowedTo,
    baseUrl: normalizeBaseUrl(env.EASYHOOK_BASE_URL ?? "https://api.easyhook.dev"),
  };
}

export function requireAllowedRecipient(config: EasyhookConfig, value: string): string {
  const normalized = normalizePhone(value);
  if (!normalized || !config.allowedTo.has(normalized)) {
    throw new Error("recipient_not_allowed: The destination is not listed in EASYHOOK_ALLOWED_TO");
  }
  return normalized;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(trimmed)) throw new Error("EASYHOOK_BASE_URL must be an HTTP(S) URL");
  return trimmed.replace(/\/v1$/i, "");
}
