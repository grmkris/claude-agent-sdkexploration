import { test, expect, describe, afterEach } from "bun:test";

import type { ParsedEmail } from "./email";
import type { WorkspaceEmailConfig } from "./types";

import { formatEmailPrompt } from "./email-executor";

function makeEmail(overrides: Partial<ParsedEmail> = {}): ParsedEmail {
  return {
    from: "sender@example.com",
    to: "recipient@example.com",
    subject: "Test Subject",
    body: "Hello, this is the email body.",
    messageId: "<test-msg-id@example.com>",
    date: "2026-02-24T10:00:00Z",
    recipient: "recipient@example.com",
    attachments: [],
    ...overrides,
  };
}

function makeConfig(
  overrides: Partial<WorkspaceEmailConfig> = {}
): WorkspaceEmailConfig {
  return {
    projectSlug: "test-project",
    address: "agent@myproject.com",
    enabled: true,
    prompt: "Handle all incoming emails professionally.",
    onInbound: "new_session",
    ...overrides,
  };
}

// Save and restore env vars changed during tests
const originalChannelEmailDomain = process.env.CHANNEL_EMAIL_DOMAIN;

afterEach(() => {
  if (originalChannelEmailDomain === undefined) {
    delete process.env.CHANNEL_EMAIL_DOMAIN;
  } else {
    process.env.CHANNEL_EMAIL_DOMAIN = originalChannelEmailDomain;
  }
});

// --- formatEmailPrompt ---

describe("formatEmailPrompt", () => {
  test("no attachments - no [Attachments] section in output", () => {
    const email = makeEmail({ attachments: [] });
    const config = makeConfig();
    const result = formatEmailPrompt(email, config);
    expect(result).not.toContain("[Attachments]");
    expect(result).not.toContain("Note: Download and process");
  });

  test("includes email header fields in prompt", () => {
    const email = makeEmail();
    const config = makeConfig();
    const result = formatEmailPrompt(email, config);
    expect(result).toContain("[Email Received]");
    expect(result).toContain("From: sender@example.com");
    expect(result).toContain("Subject: Test Subject");
    expect(result).toContain("Date: 2026-02-24T10:00:00Z");
    expect(result).toContain("Hello, this is the email body.");
  });

  test("reply instructions include correct to, subject, messageId, fromAddress", () => {
    const email = makeEmail({
      from: "customer@example.com",
      subject: "Help needed",
      messageId: "<original-msg@example.com>",
    });
    const config = makeConfig({ address: "support@company.com" });
    const result = formatEmailPrompt(email, config);
    expect(result).toContain('to: "customer@example.com"');
    expect(result).toContain('subject: "Re: Help needed"');
    expect(result).toContain('inReplyTo: "<original-msg@example.com>"');
    expect(result).toContain('fromAddress: "support@company.com"');
  });

  test("uses config.address as fromAddress when available", () => {
    const email = makeEmail();
    const config = makeConfig({ address: "mybot@myapp.com" });
    const result = formatEmailPrompt(email, config);
    expect(result).toContain('fromAddress: "mybot@myapp.com"');
  });

  test("uses CHANNEL_EMAIL_DOMAIN fallback when config.address is empty", () => {
    process.env.CHANNEL_EMAIL_DOMAIN = "custom-domain.io";
    const email = makeEmail();
    const config = makeConfig({ address: "" });
    const result = formatEmailPrompt(email, config);
    expect(result).toContain('fromAddress: "agent@custom-domain.io"');
  });

  test("uses your-domain.com when config.address is empty and CHANNEL_EMAIL_DOMAIN is not set", () => {
    delete process.env.CHANNEL_EMAIL_DOMAIN;
    const email = makeEmail();
    const config = makeConfig({ address: "" });
    const result = formatEmailPrompt(email, config);
    expect(result).toContain('fromAddress: "agent@your-domain.com"');
  });

  test("includes workspace instructions from config.prompt", () => {
    const email = makeEmail();
    const config = makeConfig({ prompt: "Always reply within 24 hours." });
    const result = formatEmailPrompt(email, config);
    expect(result).toContain("Workspace instructions:");
    expect(result).toContain("Always reply within 24 hours.");
  });

  test("single image attachment - [Attachments] section appears with filename, type, size", () => {
    const email = makeEmail({
      attachments: [
        {
          filename: "photo.jpg",
          contentType: "image/jpeg",
          size: 204800,
          contentDisposition: "attachment",
          downloadUrl: "https://example.com/download/photo.jpg",
        },
      ],
    });
    const config = makeConfig();
    const result = formatEmailPrompt(email, config);
    expect(result).toContain("[Attachments]");
    expect(result).toContain("photo.jpg");
    expect(result).toContain("image/jpeg");
    expect(result).toContain("200KB");
    expect(result).toContain(
      "Note: Download and process these attachments using their URLs if needed."
    );
  });

  test("single attachment size is rounded to KB", () => {
    const email = makeEmail({
      attachments: [
        {
          filename: "small.txt",
          contentType: "text/plain",
          size: 1536, // 1.5 KB -> rounds to 2
          contentDisposition: "attachment",
          downloadUrl: "https://example.com/small.txt",
        },
      ],
    });
    const config = makeConfig();
    const result = formatEmailPrompt(email, config);
    expect(result).toContain("2KB");
  });

  test("zero-size attachment shows 0KB", () => {
    const email = makeEmail({
      attachments: [
        {
          filename: "empty.txt",
          contentType: "text/plain",
          size: 0,
          contentDisposition: "attachment",
          downloadUrl: "https://example.com/empty.txt",
        },
      ],
    });
    const config = makeConfig();
    const result = formatEmailPrompt(email, config);
    expect(result).toContain("0KB");
  });

  test("multiple mixed attachments - all appear in [Attachments] section", () => {
    const email = makeEmail({
      attachments: [
        {
          filename: "report.pdf",
          contentType: "application/pdf",
          size: 102400,
          contentDisposition: "attachment",
          downloadUrl: "https://example.com/report.pdf",
        },
        {
          filename: "data.csv",
          contentType: "text/csv",
          size: 2048,
          contentDisposition: "attachment",
          downloadUrl: "https://example.com/data.csv",
        },
        {
          filename: "logo.png",
          contentType: "image/png",
          size: 8192,
          contentDisposition: "inline",
          downloadUrl: "https://example.com/logo.png",
        },
      ],
    });
    const config = makeConfig();
    const result = formatEmailPrompt(email, config);
    expect(result).toContain("[Attachments]");
    expect(result).toContain("report.pdf");
    expect(result).toContain("application/pdf");
    expect(result).toContain("100KB");
    expect(result).toContain("data.csv");
    expect(result).toContain("text/csv");
    expect(result).toContain("2KB");
    expect(result).toContain("logo.png");
    expect(result).toContain("image/png");
    expect(result).toContain("8KB");
  });

  test("attachment section appears between body and reply instructions", () => {
    const email = makeEmail({
      body: "Please see attached.",
      attachments: [
        {
          filename: "doc.pdf",
          contentType: "application/pdf",
          size: 1024,
          contentDisposition: "attachment",
          downloadUrl: "https://example.com/doc.pdf",
        },
      ],
    });
    const config = makeConfig();
    const result = formatEmailPrompt(email, config);

    const attachIdx = result.indexOf("[Attachments]");
    const replyIdx = result.indexOf("---");
    expect(attachIdx).toBeGreaterThan(-1);
    expect(attachIdx).toBeLessThan(replyIdx);
  });
});
