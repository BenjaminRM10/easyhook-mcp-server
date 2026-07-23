export interface EasyhookContact {
  phone: string;
  name: string;
  description: string;
}

export interface EasyhookConfig {
  apiKey: string;
  from: string;
  allowedTo: ReadonlySet<string>;
  contacts: readonly EasyhookContact[];
  baseUrl: string;
}

export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): EasyhookConfig {
  const apiKey = required(env, "EASYHOOK_API_KEY");
  const from = normalizePhone(required(env, "EASYHOOK_FROM"));
  const contacts = env.EASYHOOK_CONTACTS?.trim()
    ? parseContacts(env.EASYHOOK_CONTACTS)
    : parseLegacyContacts(required(env, "EASYHOOK_ALLOWED_TO"));
  const allowedTo = new Set(contacts.map((contact) => contact.phone));

  if (!from) throw new Error("EASYHOOK_FROM must contain a phone number");
  if (allowedTo.size === 0) {
    throw new Error("EASYHOOK_CONTACTS or EASYHOOK_ALLOWED_TO must contain at least one phone number");
  }

  return {
    apiKey,
    from,
    allowedTo,
    contacts,
    baseUrl: normalizeBaseUrl(env.EASYHOOK_BASE_URL ?? "https://api.easyhook.dev"),
  };
}

export function requireAllowedRecipient(config: EasyhookConfig, value: string): string {
  const normalized = normalizePhone(value);
  if (normalized && config.allowedTo.has(normalized)) return normalized;
  const byName = config.contacts.find((contact) => contact.name.toLocaleLowerCase() === value.trim().toLocaleLowerCase());
  if (byName) return byName.phone;
  throw new Error("recipient_not_allowed: Use a phone or contact name configured in EASYHOOK_CONTACTS");
}

function parseContacts(raw: string): EasyhookContact[] {
  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    throw new Error("EASYHOOK_CONTACTS must be valid JSON");
  }
  if (!Array.isArray(input)) throw new Error("EASYHOOK_CONTACTS must be a JSON array");

  const contacts = input.map((value, index) => {
    if (!isRecord(value)) throw new Error(`EASYHOOK_CONTACTS[${index}] must be an object`);
    const phone = normalizePhone(readString(value.phone));
    const name = readString(value.name).trim();
    const description = readString(value.description).trim();
    if (!phone || !name) throw new Error(`EASYHOOK_CONTACTS[${index}] requires phone and name`);
    return { phone, name, description };
  });

  const phones = new Set<string>();
  const names = new Set<string>();
  for (const contact of contacts) {
    const normalizedName = contact.name.toLocaleLowerCase();
    if (phones.has(contact.phone)) throw new Error(`Duplicate EASYHOOK_CONTACTS phone: ${contact.phone}`);
    if (names.has(normalizedName)) throw new Error(`Duplicate EASYHOOK_CONTACTS name: ${contact.name}`);
    phones.add(contact.phone);
    names.add(normalizedName);
  }
  return contacts;
}

function parseLegacyContacts(raw: string): EasyhookContact[] {
  return raw
    .split(",")
    .map(normalizePhone)
    .filter(Boolean)
    .filter((phone, index, all) => all.indexOf(phone) === index)
    .map((phone) => ({ phone, name: phone, description: "" }));
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
