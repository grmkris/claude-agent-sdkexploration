import { test, expect, describe, beforeEach, afterAll } from "bun:test";
import { unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpFile = join(tmpdir(), `explorer-store-test-${Date.now()}.json`);
process.env.EXPLORER_STORE_PATH = tmpFile;

// Import AFTER setting env var
const {
  getCrons,
  addCron,
  removeCron,
  toggleCron,
  updateCronStatus,
  getFavorites,
  toggleFavoriteProject,
  toggleFavoriteSession,
  addMessage,
  getMessages,
  markMessageRead,
  getUnreadBySession,
  getWebhooks,
  getWebhook,
  addWebhook,
  removeWebhook,
  toggleWebhook,
  updateWebhookStatus,
  incrementWebhookTriggerCount,
  addWebhookEvent,
  updateWebhookEventStatus,
  getWebhookEvents,
  addCronEvent,
  updateCronEventStatus,
  getCronEvents,
} = await import("./explorer-store");

beforeEach(async () => {
  // Reset store to empty before each test
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

// --- Crons ---

describe("crons", () => {
  const makeCron = (id = "c1") => ({
    id,
    expression: "*/5 * * * *",
    prompt: "test prompt",
    projectSlug: "test-project",
    enabled: true,
    createdAt: new Date().toISOString(),
  });

  test("add and list", async () => {
    await addCron(makeCron("c1"));
    await addCron(makeCron("c2"));
    const crons = await getCrons();
    expect(crons).toHaveLength(2);
    expect(crons[0].id).toBe("c1");
    expect(crons[1].id).toBe("c2");
  });

  test("toggle enabled", async () => {
    await addCron(makeCron("c1"));
    const toggled = await toggleCron("c1");
    expect(toggled?.enabled).toBe(false);
    const toggled2 = await toggleCron("c1");
    expect(toggled2?.enabled).toBe(true);
  });

  test("toggle nonexistent returns null", async () => {
    const result = await toggleCron("nope");
    expect(result).toBeNull();
  });

  test("update status", async () => {
    await addCron(makeCron("c1"));
    await updateCronStatus("c1", "running", "2025-01-01T00:00:00Z");
    const crons = await getCrons();
    expect(crons[0].lastRunStatus).toBe("running");
    expect(crons[0].lastRun).toBe("2025-01-01T00:00:00Z");

    await updateCronStatus("c1", "success");
    const crons2 = await getCrons();
    expect(crons2[0].lastRunStatus).toBe("success");
  });

  test("remove", async () => {
    await addCron(makeCron("c1"));
    await addCron(makeCron("c2"));
    const removed = await removeCron("c1");
    expect(removed).toBe(true);
    const crons = await getCrons();
    expect(crons).toHaveLength(1);
    expect(crons[0].id).toBe("c2");
  });

  test("remove nonexistent returns false", async () => {
    const result = await removeCron("nope");
    expect(result).toBe(false);
  });
});

// --- Favorites ---

describe("favorites", () => {
  test("starts empty", async () => {
    const favs = await getFavorites();
    expect(favs.projects).toEqual([]);
    expect(favs.sessions).toEqual([]);
  });

  test("toggle project on/off", async () => {
    const f1 = await toggleFavoriteProject("proj-a");
    expect(f1.projects).toEqual(["proj-a"]);

    const f2 = await toggleFavoriteProject("proj-b");
    expect(f2.projects).toEqual(["proj-a", "proj-b"]);

    const f3 = await toggleFavoriteProject("proj-a");
    expect(f3.projects).toEqual(["proj-b"]);
  });

  test("toggle session on/off", async () => {
    const f1 = await toggleFavoriteSession("s1");
    expect(f1.sessions).toEqual(["s1"]);

    const f2 = await toggleFavoriteSession("s1");
    expect(f2.sessions).toEqual([]);
  });
});

// --- Messages ---

describe("messages", () => {
  const makeMsg = (id: string, toProject: string, toSession?: string) => ({
    id,
    from: { projectSlug: "sender-proj", sessionId: "sender-s" },
    to: { projectSlug: toProject, sessionId: toSession },
    body: `msg ${id}`,
    timestamp: new Date().toISOString(),
    read: false,
  });

  test("add and list by project", async () => {
    await addMessage(makeMsg("m1", "proj-a", "s1"));
    await addMessage(makeMsg("m2", "proj-a", "s2"));
    await addMessage(makeMsg("m3", "proj-b"));

    const msgsA = await getMessages("proj-a");
    expect(msgsA).toHaveLength(2);

    const msgsB = await getMessages("proj-b");
    expect(msgsB).toHaveLength(1);
  });

  test("list by project + session", async () => {
    await addMessage(makeMsg("m1", "proj-a", "s1"));
    await addMessage(makeMsg("m2", "proj-a", "s2"));

    const msgs = await getMessages("proj-a", "s1");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].id).toBe("m1");
  });

  test("mark read", async () => {
    await addMessage(makeMsg("m1", "proj-a"));
    const marked = await markMessageRead("m1");
    expect(marked?.read).toBe(true);

    // Verify persisted
    const msgs = await getMessages("proj-a");
    expect(msgs[0].read).toBe(true);
  });

  test("mark read nonexistent returns null", async () => {
    const result = await markMessageRead("nope");
    expect(result).toBeNull();
  });

  test("unread by session", async () => {
    await addMessage(makeMsg("m1", "proj-a", "s1"));
    await addMessage(makeMsg("m2", "proj-a", "s1"));
    await addMessage(makeMsg("m3", "proj-a", "s2"));
    await markMessageRead("m1");

    const unread = await getUnreadBySession("proj-a");
    expect(unread["s1"]).toBe(1);
    expect(unread["s2"]).toBe(1);
  });

  test("unread counts project-wide messages under __project__", async () => {
    await addMessage(makeMsg("m1", "proj-a"));
    const unread = await getUnreadBySession("proj-a");
    expect(unread["__project__"]).toBe(1);
  });
});

// --- Webhooks ---

describe("webhooks", () => {
  const makeWebhook = (id = "w1") => ({
    id,
    name: `webhook-${id}`,
    provider: "generic" as const,
    prompt: "test prompt",
    enabled: true,
    createdAt: new Date().toISOString(),
    triggerCount: 0,
  });

  test("add and list", async () => {
    await addWebhook(makeWebhook("w1"));
    await addWebhook(makeWebhook("w2"));
    const webhooks = await getWebhooks();
    expect(webhooks).toHaveLength(2);
    expect(webhooks[0].id).toBe("w1");
    expect(webhooks[1].id).toBe("w2");
  });

  test("get by id", async () => {
    await addWebhook(makeWebhook("w1"));
    const wh = await getWebhook("w1");
    expect(wh?.id).toBe("w1");
    const nope = await getWebhook("nope");
    expect(nope).toBeNull();
  });

  test("toggle enabled", async () => {
    await addWebhook(makeWebhook("w1"));
    const toggled = await toggleWebhook("w1");
    expect(toggled?.enabled).toBe(false);
    const toggled2 = await toggleWebhook("w1");
    expect(toggled2?.enabled).toBe(true);
  });

  test("toggle nonexistent returns null", async () => {
    const result = await toggleWebhook("nope");
    expect(result).toBeNull();
  });

  test("update status", async () => {
    await addWebhook(makeWebhook("w1"));
    await updateWebhookStatus("w1", "running", "2025-01-01T00:00:00Z");
    const webhooks = await getWebhooks();
    expect(webhooks[0].lastStatus).toBe("running");
    expect(webhooks[0].lastTriggered).toBe("2025-01-01T00:00:00Z");

    await updateWebhookStatus("w1", "success");
    const webhooks2 = await getWebhooks();
    expect(webhooks2[0].lastStatus).toBe("success");
  });

  test("increment trigger count", async () => {
    await addWebhook(makeWebhook("w1"));
    await incrementWebhookTriggerCount("w1");
    await incrementWebhookTriggerCount("w1");
    const webhooks = await getWebhooks();
    expect(webhooks[0].triggerCount).toBe(2);
  });

  test("remove", async () => {
    await addWebhook(makeWebhook("w1"));
    await addWebhook(makeWebhook("w2"));
    const removed = await removeWebhook("w1");
    expect(removed).toBe(true);
    const webhooks = await getWebhooks();
    expect(webhooks).toHaveLength(1);
    expect(webhooks[0].id).toBe("w2");
  });

  test("remove nonexistent returns false", async () => {
    const result = await removeWebhook("nope");
    expect(result).toBe(false);
  });
});

// --- Webhook Events ---

describe("webhook events", () => {
  const makeEvent = (id: string, webhookId: string, timestamp: string) => ({
    id,
    webhookId,
    timestamp,
    provider: "generic",
    eventType: "test",
    action: "create",
    payloadSummary: `event ${id}`,
    status: "running" as const,
  });

  test("add and list sorted desc", async () => {
    await addWebhookEvent(makeEvent("e1", "w1", "2025-01-01T00:00:00Z"));
    await addWebhookEvent(makeEvent("e2", "w1", "2025-01-02T00:00:00Z"));
    const events = await getWebhookEvents("w1");
    expect(events).toHaveLength(2);
    expect(events[0].id).toBe("e2"); // newer first
    expect(events[1].id).toBe("e1");
  });

  test("filter by webhookId", async () => {
    await addWebhookEvent(makeEvent("e1", "w1", "2025-01-01T00:00:00Z"));
    await addWebhookEvent(makeEvent("e2", "w2", "2025-01-02T00:00:00Z"));
    const events = await getWebhookEvents("w1");
    expect(events).toHaveLength(1);
    expect(events[0].webhookId).toBe("w1");
  });

  test("list all when no filter", async () => {
    await addWebhookEvent(makeEvent("e1", "w1", "2025-01-01T00:00:00Z"));
    await addWebhookEvent(makeEvent("e2", "w2", "2025-01-02T00:00:00Z"));
    const events = await getWebhookEvents();
    expect(events).toHaveLength(2);
  });

  test("update event status", async () => {
    await addWebhookEvent(makeEvent("e1", "w1", "2025-01-01T00:00:00Z"));
    await updateWebhookEventStatus("e1", "success", "session-123");
    const events = await getWebhookEvents();
    expect(events[0].status).toBe("success");
    expect(events[0].sessionId).toBe("session-123");
  });

  test("caps at 100", async () => {
    for (let i = 0; i < 105; i++) {
      await addWebhookEvent(
        makeEvent(
          `e${i}`,
          "w1",
          `2025-01-01T${String(i).padStart(2, "0")}:00:00Z`
        )
      );
    }
    const events = await getWebhookEvents();
    expect(events).toHaveLength(100);
  });
});

// --- Cron Events ---

describe("cron events", () => {
  const makeCronEvent = (id: string, cronId: string, timestamp: string) => ({
    id,
    cronId,
    timestamp,
    status: "running" as const,
    expression: "*/5 * * * *",
    prompt: "test cron",
  });

  test("add and list", async () => {
    await addCronEvent(makeCronEvent("ce1", "c1", "2025-01-01T00:00:00Z"));
    const events = await getCronEvents();
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("ce1");
  });

  test("filter by cronId", async () => {
    await addCronEvent(makeCronEvent("ce1", "c1", "2025-01-01T00:00:00Z"));
    await addCronEvent(makeCronEvent("ce2", "c2", "2025-01-02T00:00:00Z"));
    const events = await getCronEvents("c1");
    expect(events).toHaveLength(1);
    expect(events[0].cronId).toBe("c1");
  });

  test("update status", async () => {
    await addCronEvent(makeCronEvent("ce1", "c1", "2025-01-01T00:00:00Z"));
    await updateCronEventStatus("ce1", "success");
    const events = await getCronEvents();
    expect(events[0].status).toBe("success");
  });

  test("caps at 100", async () => {
    for (let i = 0; i < 105; i++) {
      await addCronEvent(
        makeCronEvent(
          `ce${i}`,
          "c1",
          `2025-01-01T${String(i).padStart(2, "0")}:00:00Z`
        )
      );
    }
    const events = await getCronEvents();
    expect(events).toHaveLength(100);
  });
});
