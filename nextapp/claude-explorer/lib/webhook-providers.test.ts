import { test, expect, describe } from "bun:test";
import { createHmac } from "node:crypto";

import { getProvider } from "./webhook-providers";

// --- Linear ---

describe("linear provider", () => {
  const provider = getProvider("linear");

  test("getSignatureHeader", () => {
    expect(provider.getSignatureHeader()).toBe("Linear-Signature");
  });

  test("verifySignature valid", () => {
    const body = '{"action":"create","data":{"id":"123"}}';
    const secret = "test-secret";
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    expect(provider.verifySignature(body, sig, secret)).toBe(true);
  });

  test("verifySignature invalid", () => {
    const body = '{"action":"create"}';
    const secret = "test-secret";
    expect(provider.verifySignature(body, "wrong-signature", secret)).toBe(
      false
    );
  });

  test("verifySignature null signature", () => {
    expect(provider.verifySignature("{}", null, "secret")).toBe(false);
  });

  test("extractEventInfo", () => {
    const body = { action: "create", data: { title: "Fix bug" } };
    const headers = new Headers({ "Linear-Event": "Issue" });
    const info = provider.extractEventInfo(body, headers);
    expect(info.eventType).toBe("Issue");
    expect(info.action).toBe("create");
    expect(info.summary).toContain("Fix bug");
  });

  test("extractEventInfo defaults to unknown", () => {
    const body = {};
    const headers = new Headers();
    const info = provider.extractEventInfo(body, headers);
    expect(info.eventType).toBe("unknown");
    expect(info.action).toBe("unknown");
  });

  test("formatPrompt", () => {
    const body = { action: "update", data: { title: "Task" } };
    const headers = new Headers({ "Linear-Event": "Issue" });
    const result = provider.formatPrompt(body, headers, "Review this issue");
    expect(result).toContain("[Linear Webhook]");
    expect(result).toContain("Event: Issue");
    expect(result).toContain("Action: update");
    expect(result).toContain('"action": "update"');
    expect(result).toContain("Review this issue");
  });
});

// --- GitHub ---

describe("github provider", () => {
  const provider = getProvider("github");

  test("getSignatureHeader", () => {
    expect(provider.getSignatureHeader()).toBe("x-hub-signature-256");
  });

  test("verifySignature valid", () => {
    const body = '{"action":"opened","repository":{"full_name":"org/repo"}}';
    const secret = "gh-secret";
    const sig =
      "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
    expect(provider.verifySignature(body, sig, secret)).toBe(true);
  });

  test("verifySignature invalid", () => {
    const body = '{"action":"opened"}';
    expect(provider.verifySignature(body, "sha256=wrong", "secret")).toBe(
      false
    );
  });

  test("extractEventInfo", () => {
    const body = { action: "opened", repository: { full_name: "org/repo" } };
    const headers = new Headers({ "x-github-event": "pull_request" });
    const info = provider.extractEventInfo(body, headers);
    expect(info.eventType).toBe("pull_request");
    expect(info.action).toBe("opened");
    expect(info.summary).toContain("org/repo");
  });
});

// --- Generic ---

describe("generic provider", () => {
  const provider = getProvider("generic");

  test("verifySignature always true", () => {
    expect(provider.verifySignature("anything", null, "secret")).toBe(true);
    expect(provider.verifySignature("{}", "sig", "")).toBe(true);
  });

  test("extractEventInfo", () => {
    const body = { foo: 1, bar: 2, baz: 3 };
    const info = provider.extractEventInfo(body, new Headers());
    expect(info.eventType).toBe("generic");
    expect(info.action).toBe("received");
    expect(info.summary).toContain("foo");
    expect(info.summary).toContain("bar");
  });

  test("formatPrompt", () => {
    const body = { test: true };
    const result = provider.formatPrompt(body, new Headers(), "handle this");
    expect(result).toContain("[Webhook]");
    expect(result).toContain('"test": true');
    expect(result).toContain("handle this");
  });
});

// --- getProvider ---

describe("getProvider", () => {
  test("returns known providers", () => {
    const linear = getProvider("linear");
    const github = getProvider("github");
    const generic = getProvider("generic");
    expect(linear.getSignatureHeader()).toBe("Linear-Signature");
    expect(github.getSignatureHeader()).toBe("x-hub-signature-256");
    expect(generic.getSignatureHeader()).toBe("");
  });

  test("unknown falls back to generic", () => {
    const provider = getProvider("unknown_provider");
    expect(provider.verifySignature("", null, "")).toBe(true);
    expect(provider.getSignatureHeader()).toBe("");
  });
});
