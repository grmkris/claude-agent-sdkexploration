import { test, expect, describe } from "bun:test";

import { getSessionEventBus } from "./event-bus";

describe("event bus", () => {
  test("singleton returns same instance", () => {
    const a = getSessionEventBus();
    const b = getSessionEventBus();
    expect(a).toBe(b);
  });

  test("survives globalThis reset", () => {
    const original = getSessionEventBus();
    globalThis.__explorerEventBus = undefined;
    const fresh = getSessionEventBus();
    expect(fresh).not.toBe(original);
    // New one still works
    expect(fresh.listenerCount("test")).toBe(0);
  });

  test("emits and receives events", () => {
    const bus = getSessionEventBus();
    let received: unknown = null;
    const handler = (data: unknown) => {
      received = data;
    };

    bus.on("session:state", handler);
    bus.emit("session:state", { sessionId: "x", state: "thinking" });
    bus.off("session:state", handler);

    expect(received).toEqual({ sessionId: "x", state: "thinking" });
  });

  test("multiple listeners both receive", () => {
    const bus = getSessionEventBus();
    const results: unknown[] = [];
    const h1 = (d: unknown) => results.push(d);
    const h2 = (d: unknown) => results.push(d);

    bus.on("session:state", h1);
    bus.on("session:state", h2);
    bus.emit("session:state", { id: 1 });
    bus.off("session:state", h1);
    bus.off("session:state", h2);

    expect(results).toHaveLength(2);
  });
});
