import { afterEach, describe, expect, it, vi } from "vitest";

import { RiftcodexCardSourceClient } from "./riftcodex-card-source.client.js";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Read the headers passed to a given fetch mock call as a Headers instance. */
function headersOfCall(spy: ReturnType<typeof vi.spyOn>, callIndex = 0): Headers {
  const init = spy.mock.calls[callIndex]?.[1] as RequestInit | undefined;
  return new Headers(init?.headers);
}

describe("RiftcodexCardSourceClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("identifies itself with a descriptive User-Agent + Accept so bot protection does not 403", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ items: [], pages: 1 }));

    await new RiftcodexCardSourceClient().fetchRawCards();

    expect(fetchSpy).toHaveBeenCalled();
    const headers = headersOfCall(fetchSpy);
    // A non-empty, app-identifying User-Agent (not the default undici tell that
    // Cloudflare Bot Fight Mode blocks from datacenter IPs) and a JSON Accept.
    expect(headers.get("user-agent")).toMatch(/TeamBrewer/i);
    expect(headers.get("accept")).toBe("application/json");
  });

  it("lets an operator override the User-Agent via env (to add a contact per good-citizen practice)", async () => {
    vi.stubEnv("RIFTBOUND_CARDS_USER_AGENT", "TeamBrewer/1.0 (+mailto:ops@example.com)");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ items: [], pages: 1 }));

    await new RiftcodexCardSourceClient().fetchRawCards();

    expect(headersOfCall(fetchSpy).get("user-agent")).toBe(
      "TeamBrewer/1.0 (+mailto:ops@example.com)",
    );
  });

  it("throws a helpful error on a non-ok response (e.g. a 403 from bot protection)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 403));

    await expect(new RiftcodexCardSourceClient().fetchRawCards()).rejects.toThrow(/403/);
  });

  it("sends the identifying headers on every page while paginating", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: "c1" }], pages: 2 }))
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: "c2" }], pages: 2 }));

    const records = await new RiftcodexCardSourceClient().fetchRawCards();

    expect(records).toHaveLength(2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(headersOfCall(fetchSpy, 1).get("user-agent")).toMatch(/TeamBrewer/i);
  });
});
