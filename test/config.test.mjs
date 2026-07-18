import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig, normalizePhone, requireAllowedRecipient } from "../dist/config.js";

test("normalizes formatted phone numbers", () => {
  assert.equal(normalizePhone("+52 1 866 147 9075"), "5218661479075");
});

test("loads a sender and comma-separated recipient allowlist", () => {
  const config = loadConfig({
    EASYHOOK_API_KEY: "eh_live_test",
    EASYHOOK_FROM: "+52 1 866 147 9075",
    EASYHOOK_ALLOWED_TO: "+52 1 566 006 9997, 528442461514",
  });
  assert.equal(config.from, "5218661479075");
  assert.deepEqual([...config.allowedTo], ["5215660069997", "528442461514"]);
});

test("rejects recipients outside the allowlist", () => {
  const config = loadConfig({
    EASYHOOK_API_KEY: "eh_live_test",
    EASYHOOK_FROM: "5218661479075",
    EASYHOOK_ALLOWED_TO: "5215660069997",
  });
  assert.throws(() => requireAllowedRecipient(config, "528442461514"), /recipient_not_allowed/);
});

test("accepts formatted forms of an allowlisted recipient", () => {
  const config = loadConfig({
    EASYHOOK_API_KEY: "eh_live_test",
    EASYHOOK_FROM: "5218661479075",
    EASYHOOK_ALLOWED_TO: "5215660069997",
  });
  assert.equal(requireAllowedRecipient(config, "+52 1 566 006 9997"), "5215660069997");
});
