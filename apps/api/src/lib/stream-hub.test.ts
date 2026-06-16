import { describe, it, expect, beforeEach } from "vitest";
import { StreamHub } from "./stream-hub";

// Minimal fake of the bits of express.Response the hub touches.
function fakeRes() {
  return {
    written: [] as string[],
    ended: false,
    write(data: string) {
      this.written.push(data);
      return true;
    },
    end() {
      this.ended = true;
    },
  };
}

describe("StreamHub", () => {
  let hub: StreamHub;
  beforeEach(() => {
    hub = new StreamHub();
  });

  it("fans out published events to live subscribers", () => {
    const session = hub.create("conv-1", "user-1");
    const res = fakeRes();
    hub.subscribe(session, res as never);

    hub.publish(session, { type: "delta", token: "Hi" });

    expect(res.written.join("")).toContain('"token":"Hi"');
  });

  it("replays buffered events to a subscriber that joins late", () => {
    const session = hub.create("conv-1", "user-1");
    hub.publish(session, { type: "delta", token: "Par" });
    hub.publish(session, { type: "delta", token: "tial" });

    const latecomer = fakeRes();
    hub.subscribe(session, latecomer as never);

    const text = latecomer.written.join("");
    expect(text).toContain('"token":"Par"');
    expect(text).toContain('"token":"tial"');
  });

  it("ends a subscriber immediately if the session already finished", () => {
    const session = hub.create("conv-1", "user-1");
    hub.publish(session, { type: "delta", token: "done" });
    hub.finish(session, "done");

    const late = fakeRes();
    hub.subscribe(session, late as never);

    // It still gets the buffered history, then is closed.
    expect(late.written.join("")).toContain('"token":"done"');
    expect(late.ended).toBe(true);
  });

  it("finish() ends all live subscribers", () => {
    const session = hub.create("conv-1", "user-1");
    const a = fakeRes();
    const b = fakeRes();
    hub.subscribe(session, a as never);
    hub.subscribe(session, b as never);

    hub.finish(session, "done");

    expect(a.ended).toBe(true);
    expect(b.ended).toBe(true);
    expect(session.status).toBe("done");
  });

  it("does not write to a subscriber after it unsubscribes (client left)", () => {
    const session = hub.create("conv-1", "user-1");
    const res = fakeRes();
    hub.subscribe(session, res as never);
    hub.unsubscribe(session, res as never);

    hub.publish(session, { type: "delta", token: "background" });

    // The client left, but the event is still buffered for later reconnects.
    expect(res.written.join("")).not.toContain("background");
    expect(session.events.length).toBe(1);
  });

  it("get() returns the active session and undefined once evicted", () => {
    const session = hub.create("conv-1", "user-1");
    expect(hub.get("conv-1")).toBe(session);
    hub.evict("conv-1");
    expect(hub.get("conv-1")).toBeUndefined();
  });

  it("creating a new session for the same conversation aborts the previous one", () => {
    const first = hub.create("conv-1", "user-1");
    const second = hub.create("conv-1", "user-1");
    expect(first.abort.signal.aborted).toBe(true);
    expect(hub.get("conv-1")).toBe(second);
  });
});
