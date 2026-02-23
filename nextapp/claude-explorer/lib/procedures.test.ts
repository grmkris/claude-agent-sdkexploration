import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpFile = join(tmpdir(), `procedures-test-${Date.now()}.json`);
process.env.EXPLORER_STORE_PATH = tmpFile;

// Import AFTER setting env var
const { createRouterClient } = await import("@orpc/server");
const { router } = await import("./procedures");

const client = createRouterClient(router);

beforeEach(async () => {
  await Bun.write(
    tmpFile,
    JSON.stringify({
      favorites: { projects: [], sessions: [] },
      crons: [],
      messages: [],
      webhooks: [],
      webhookEvents: [],
      cronEvents: [],
    })
  );
});

afterAll(() => {
  try {
    unlinkSync(tmpFile);
  } catch {}
});

// --- Crons via procedures ---

describe("crons procedures", () => {
  test("list returns empty initially", async () => {
    const crons = await client.crons.list();
    expect(crons).toEqual([]);
  });

  test("create returns cron with all fields", async () => {
    const cron = await client.crons.create({
      expression: "*/5 * * * *",
      prompt: "test prompt",
      projectSlug: "test-project",
    });
    expect(cron.expression).toBe("*/5 * * * *");
    expect(cron.prompt).toBe("test prompt");
    expect(cron.projectSlug).toBe("test-project");
    expect(cron.enabled).toBe(true);
    expect(cron.id).toBeTruthy();
    expect(cron.createdAt).toBeTruthy();
  });

  test("create with sessionId", async () => {
    const cron = await client.crons.create({
      expression: "0 9 * * *",
      prompt: "with session",
      projectSlug: "test-project",
      sessionId: "abc-123",
    });
    expect(cron.sessionId).toBe("abc-123");
  });

  test("full CRUD lifecycle", async () => {
    // Create
    const cron = await client.crons.create({
      expression: "*/30 * * * *",
      prompt: "lifecycle test",
      projectSlug: "test-project",
    });

    // List — has 1
    let crons = await client.crons.list();
    expect(crons).toHaveLength(1);
    expect(crons[0].id).toBe(cron.id);

    // Toggle off
    const toggled = await client.crons.toggle({ id: cron.id });
    expect(toggled?.enabled).toBe(false);

    // Toggle on
    const toggled2 = await client.crons.toggle({ id: cron.id });
    expect(toggled2?.enabled).toBe(true);

    // Delete
    const deleted = await client.crons.delete({ id: cron.id });
    expect(deleted.success).toBe(true);

    // List — empty
    crons = await client.crons.list();
    expect(crons).toEqual([]);
  });

  test("delete nonexistent returns false", async () => {
    const result = await client.crons.delete({ id: "nonexistent" });
    expect(result.success).toBe(false);
  });

  test("toggle nonexistent returns null", async () => {
    const result = await client.crons.toggle({ id: "nonexistent" });
    expect(result).toBeNull();
  });
});

// --- Favorites via procedures ---

describe("favorites procedures", () => {
  test("get returns empty initially", async () => {
    const favs = await client.favorites.get();
    expect(favs.projects).toEqual([]);
    expect(favs.sessions).toEqual([]);
  });

  test("toggle project on/off", async () => {
    const f1 = await client.favorites.toggleProject({ slug: "proj-a" });
    expect(f1.projects).toEqual(["proj-a"]);

    const f2 = await client.favorites.toggleProject({ slug: "proj-a" });
    expect(f2.projects).toEqual([]);
  });

  test("toggle session on/off", async () => {
    const f1 = await client.favorites.toggleSession({ id: "s1" });
    expect(f1.sessions).toEqual(["s1"]);

    const f2 = await client.favorites.toggleSession({ id: "s1" });
    expect(f2.sessions).toEqual([]);
  });
});

// --- Messages via procedures ---

describe("messages procedures", () => {
  test("send and list", async () => {
    const msg = await client.messages.send({
      from: { projectSlug: "proj-a", sessionId: "s1" },
      to: { projectSlug: "proj-b", sessionId: "s2" },
      body: "hello from procedures test",
    });
    expect(msg.id).toBeTruthy();
    expect(msg.body).toBe("hello from procedures test");
    expect(msg.read).toBe(false);

    const msgs = await client.messages.list({
      projectSlug: "proj-b",
      sessionId: "s2",
    });
    expect(msgs).toHaveLength(1);
    expect(msgs[0].id).toBe(msg.id);
  });

  test("mark read", async () => {
    const msg = await client.messages.send({
      from: { projectSlug: "proj-a", sessionId: "s1" },
      to: { projectSlug: "proj-b" },
      body: "test",
    });

    const marked = await client.messages.markRead({ id: msg.id });
    expect(marked?.read).toBe(true);
  });

  test("unread by session", async () => {
    await client.messages.send({
      from: { projectSlug: "a", sessionId: "s1" },
      to: { projectSlug: "target", sessionId: "s1" },
      body: "msg1",
    });
    await client.messages.send({
      from: { projectSlug: "a", sessionId: "s1" },
      to: { projectSlug: "target", sessionId: "s1" },
      body: "msg2",
    });
    await client.messages.send({
      from: { projectSlug: "a", sessionId: "s1" },
      to: { projectSlug: "target", sessionId: "s2" },
      body: "msg3",
    });

    const unread = await client.messages.unreadBySession({
      projectSlug: "target",
    });
    expect(unread["s1"]).toBe(2);
    expect(unread["s2"]).toBe(1);
  });
});

// --- Webhooks via procedures ---

describe("webhooks procedures", () => {
  test("list returns empty initially", async () => {
    const webhooks = await client.webhooks.list();
    expect(webhooks).toEqual([]);
  });

  test("create returns webhook with all fields", async () => {
    const wh = await client.webhooks.create({
      name: "test webhook",
      provider: "generic",
      prompt: "do something",
    });
    expect(wh.name).toBe("test webhook");
    expect(wh.provider).toBe("generic");
    expect(wh.prompt).toBe("do something");
    expect(wh.enabled).toBe(true);
    expect(wh.triggerCount).toBe(0);
    expect(wh.id).toBeTruthy();
    expect(wh.createdAt).toBeTruthy();
  });

  test("create with optional fields", async () => {
    const wh = await client.webhooks.create({
      name: "linear hook",
      provider: "linear",
      prompt: "handle issue",
      projectSlug: "my-project",
      sessionId: "sess-123",
      signingSecret: "secret-abc",
    });
    expect(wh.projectSlug).toBe("my-project");
    expect(wh.sessionId).toBe("sess-123");
    expect(wh.signingSecret).toBe("secret-abc");
  });

  test("full CRUD lifecycle", async () => {
    // Create
    const wh = await client.webhooks.create({
      name: "lifecycle test",
      provider: "generic",
      prompt: "test",
    });

    // List — has 1
    let webhooks = await client.webhooks.list();
    expect(webhooks).toHaveLength(1);
    expect(webhooks[0].id).toBe(wh.id);

    // Toggle off
    const toggled = await client.webhooks.toggle({ id: wh.id });
    expect(toggled?.enabled).toBe(false);

    // Toggle on
    const toggled2 = await client.webhooks.toggle({ id: wh.id });
    expect(toggled2?.enabled).toBe(true);

    // Delete
    const deleted = await client.webhooks.delete({ id: wh.id });
    expect(deleted.success).toBe(true);

    // List — empty
    webhooks = await client.webhooks.list();
    expect(webhooks).toEqual([]);
  });

  test("delete nonexistent returns false", async () => {
    const result = await client.webhooks.delete({ id: "nonexistent" });
    expect(result.success).toBe(false);
  });

  test("toggle nonexistent returns null", async () => {
    const result = await client.webhooks.toggle({ id: "nonexistent" });
    expect(result).toBeNull();
  });

  test("events returns empty initially", async () => {
    const events = await client.webhooks.events({});
    expect(events).toEqual([]);
  });
});

// --- Cron events via procedures ---

describe("cron events procedures", () => {
  test("events returns empty initially", async () => {
    const events = await client.crons.events({});
    expect(events).toEqual([]);
  });
});
