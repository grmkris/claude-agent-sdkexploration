import { test, expect, describe } from "bun:test";

import { parseInboundEmail, verifyWebhookToken } from "./email";

// --- parseInboundEmail ---

describe("parseInboundEmail", () => {
  test("returns null for null input", () => {
    expect(parseInboundEmail(null)).toBeNull();
  });

  test("returns null for non-object input", () => {
    expect(parseInboundEmail("string")).toBeNull();
    expect(parseInboundEmail(42)).toBeNull();
    expect(parseInboundEmail(true)).toBeNull();
  });

  test("returns null when event is not email.received", () => {
    expect(parseInboundEmail({ event: "email.sent" })).toBeNull();
    expect(parseInboundEmail({ event: "other" })).toBeNull();
    expect(parseInboundEmail({})).toBeNull();
  });

  test("returns null when email field is missing", () => {
    expect(parseInboundEmail({ event: "email.received" })).toBeNull();
    expect(
      parseInboundEmail({ event: "email.received", email: null })
    ).toBeNull();
  });

  test("parses basic fields correctly", () => {
    const payload = {
      event: "email.received",
      email: {
        from: { addresses: [{ address: "sender@example.com" }] },
        to: { addresses: [{ address: "recipient@example.com" }] },
        subject: "Hello World",
        receivedAt: "2026-02-24T10:00:00Z",
        recipient: "recipient@example.com",
        parsedData: {
          textBody: "This is the email body.",
          messageId: "<msg-123@example.com>",
          attachments: [],
        },
      },
    };

    const result = parseInboundEmail(payload);
    expect(result).not.toBeNull();
    expect(result!.from).toBe("sender@example.com");
    expect(result!.to).toBe("recipient@example.com");
    expect(result!.subject).toBe("Hello World");
    expect(result!.body).toBe("This is the email body.");
    expect(result!.messageId).toBe("<msg-123@example.com>");
    expect(result!.date).toBe("2026-02-24T10:00:00Z");
    expect(result!.recipient).toBe("recipient@example.com");
    expect(result!.attachments).toEqual([]);
  });

  test("falls back to email.messageId when parsedData.messageId is missing", () => {
    const payload = {
      event: "email.received",
      email: {
        from: { addresses: [{ address: "a@b.com" }] },
        to: { addresses: [{ address: "c@d.com" }] },
        messageId: "<fallback-id@example.com>",
        parsedData: {
          textBody: "body",
        },
      },
    };

    const result = parseInboundEmail(payload);
    expect(result!.messageId).toBe("<fallback-id@example.com>");
  });

  test("falls back to toAddress for recipient when email.recipient is missing", () => {
    const payload = {
      event: "email.received",
      email: {
        from: { addresses: [{ address: "a@b.com" }] },
        to: { addresses: [{ address: "c@d.com" }] },
        parsedData: {},
      },
    };

    const result = parseInboundEmail(payload);
    expect(result!.recipient).toBe("c@d.com");
  });

  test("uses current date when receivedAt is missing", () => {
    const before = Date.now();
    const payload = {
      event: "email.received",
      email: {
        from: { addresses: [{ address: "a@b.com" }] },
        to: { addresses: [{ address: "c@d.com" }] },
        parsedData: {},
      },
    };

    const result = parseInboundEmail(payload);
    const after = Date.now();
    const resultTime = new Date(result!.date).getTime();
    expect(resultTime).toBeGreaterThanOrEqual(before);
    expect(resultTime).toBeLessThanOrEqual(after);
  });

  test("handles empty from/to addresses gracefully", () => {
    const payload = {
      event: "email.received",
      email: {
        from: { addresses: [] },
        to: { addresses: [] },
        parsedData: {},
      },
    };

    const result = parseInboundEmail(payload);
    expect(result!.from).toBe("");
    expect(result!.to).toBe("");
  });

  test("handles missing parsedData attachments field - returns empty array", () => {
    const payload = {
      event: "email.received",
      email: {
        from: { addresses: [{ address: "a@b.com" }] },
        to: { addresses: [{ address: "c@d.com" }] },
        parsedData: {
          textBody: "body",
          messageId: "<id>",
          // no attachments field
        },
      },
    };

    const result = parseInboundEmail(payload);
    expect(result!.attachments).toEqual([]);
  });

  test("handles missing parsedData entirely - returns empty attachments", () => {
    const payload = {
      event: "email.received",
      email: {
        from: { addresses: [{ address: "a@b.com" }] },
        to: { addresses: [{ address: "c@d.com" }] },
        // no parsedData
      },
    };

    const result = parseInboundEmail(payload);
    expect(result!.attachments).toEqual([]);
  });

  test("parses single image attachment", () => {
    const payload = {
      event: "email.received",
      email: {
        from: { addresses: [{ address: "a@b.com" }] },
        to: { addresses: [{ address: "c@d.com" }] },
        parsedData: {
          textBody: "See attached image",
          messageId: "<id>",
          attachments: [
            {
              filename: "photo.jpg",
              contentType: "image/jpeg",
              size: 204800,
              contentDisposition: "attachment",
              downloadUrl: "https://example.com/download/photo.jpg",
              contentId: "img-001",
            },
          ],
        },
      },
    };

    const result = parseInboundEmail(payload);
    expect(result!.attachments).toHaveLength(1);
    const att = result!.attachments[0];
    expect(att.filename).toBe("photo.jpg");
    expect(att.contentType).toBe("image/jpeg");
    expect(att.size).toBe(204800);
    expect(att.contentDisposition).toBe("attachment");
    expect(att.downloadUrl).toBe("https://example.com/download/photo.jpg");
    expect(att.contentId).toBe("img-001");
  });

  test("parses inline attachment with contentDisposition inline", () => {
    const payload = {
      event: "email.received",
      email: {
        from: { addresses: [{ address: "a@b.com" }] },
        to: { addresses: [{ address: "c@d.com" }] },
        parsedData: {
          textBody: "body",
          attachments: [
            {
              filename: "logo.png",
              contentType: "image/png",
              size: 1024,
              contentDisposition: "inline",
              downloadUrl: "https://example.com/download/logo.png",
            },
          ],
        },
      },
    };

    const result = parseInboundEmail(payload);
    expect(result!.attachments[0].contentDisposition).toBe("inline");
  });

  test("non-inline contentDisposition defaults to attachment", () => {
    const payload = {
      event: "email.received",
      email: {
        from: { addresses: [{ address: "a@b.com" }] },
        to: { addresses: [{ address: "c@d.com" }] },
        parsedData: {
          textBody: "body",
          attachments: [
            {
              filename: "doc.pdf",
              contentType: "application/pdf",
              size: 512,
              contentDisposition: "something-else",
              downloadUrl: "https://example.com/download/doc.pdf",
            },
          ],
        },
      },
    };

    const result = parseInboundEmail(payload);
    expect(result!.attachments[0].contentDisposition).toBe("attachment");
  });

  test("parses multiple mixed attachments", () => {
    const payload = {
      event: "email.received",
      email: {
        from: { addresses: [{ address: "a@b.com" }] },
        to: { addresses: [{ address: "c@d.com" }] },
        parsedData: {
          textBody: "Multiple files attached",
          messageId: "<id>",
          attachments: [
            {
              filename: "report.pdf",
              contentType: "application/pdf",
              size: 102400,
              contentDisposition: "attachment",
              downloadUrl: "https://example.com/download/report.pdf",
            },
            {
              filename: "data.csv",
              contentType: "text/csv",
              size: 2048,
              contentDisposition: "attachment",
              downloadUrl: "https://example.com/download/data.csv",
            },
            {
              filename: "logo.png",
              contentType: "image/png",
              size: 8192,
              contentDisposition: "inline",
              downloadUrl: "https://example.com/download/logo.png",
              contentId: "logo-cid",
            },
          ],
        },
      },
    };

    const result = parseInboundEmail(payload);
    expect(result!.attachments).toHaveLength(3);
    expect(result!.attachments[0].filename).toBe("report.pdf");
    expect(result!.attachments[1].filename).toBe("data.csv");
    expect(result!.attachments[2].filename).toBe("logo.png");
    expect(result!.attachments[2].contentDisposition).toBe("inline");
    expect(result!.attachments[2].contentId).toBe("logo-cid");
  });

  test("handles missing attachment fields with defaults", () => {
    const payload = {
      event: "email.received",
      email: {
        from: { addresses: [{ address: "a@b.com" }] },
        to: { addresses: [{ address: "c@d.com" }] },
        parsedData: {
          textBody: "body",
          attachments: [
            {
              // all fields missing
            },
          ],
        },
      },
    };

    const result = parseInboundEmail(payload);
    expect(result!.attachments).toHaveLength(1);
    const att = result!.attachments[0];
    expect(att.filename).toBe("");
    expect(att.contentType).toBe("");
    expect(att.size).toBe(0);
    expect(att.contentDisposition).toBe("attachment");
    expect(att.downloadUrl).toBe("");
    expect(att.contentId).toBeUndefined();
  });
});

// --- verifyWebhookToken ---

describe("verifyWebhookToken", () => {
  test("returns true when secret is empty string", () => {
    const headers = new Headers({ "x-webhook-verification-token": "anything" });
    expect(verifyWebhookToken(headers, "")).toBe(true);
  });

  test("returns true when token matches secret", () => {
    const secret = "my-secret-token";
    const headers = new Headers({ "x-webhook-verification-token": secret });
    expect(verifyWebhookToken(headers, secret)).toBe(true);
  });

  test("returns false when token does not match secret", () => {
    const headers = new Headers({
      "x-webhook-verification-token": "wrong-token",
    });
    expect(verifyWebhookToken(headers, "correct-secret")).toBe(false);
  });

  test("returns false when token header is missing", () => {
    const headers = new Headers();
    expect(verifyWebhookToken(headers, "some-secret")).toBe(false);
  });

  test("returns false when token is empty but secret is set", () => {
    const headers = new Headers({ "x-webhook-verification-token": "" });
    expect(verifyWebhookToken(headers, "some-secret")).toBe(false);
  });
});
