// @vitest-environment node

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import handler from "./paint-advisor.js";

// ─── helpers ────────────────────────────────────────────────────────────────

const BASE_ENV = {
  ANTHROPIC_API_KEY: "sk-ant-test",
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "svc-key",
  SUPABASE_ANON_KEY: "anon-key",
};

function setEnv(overrides = {}) {
  const env = { ...BASE_ENV, ...overrides };
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
}

function clearEnv() {
  for (const k of Object.keys(BASE_ENV)) delete process.env[k];
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.VITE_SUPABASE_ANON_KEY;
}

function mockRes() {
  const res = { _status: null, _body: null };
  res.status = vi.fn((code) => { res._status = code; return res; });
  res.json  = vi.fn((body)  => { res._body  = body;  return res; });
  return res;
}

function mockReq(overrides = {}) {
  return {
    method: "POST",
    headers: { authorization: "Bearer valid-token" },
    body: { system: "You are a painting assistant.", userText: "Suggest colors." },
    ...overrides,
  };
}

// Build a configurable fetch stub that routes by URL / method.
function buildFetch({
  authOk   = true,
  userId   = "user-123",
  used     = 0,
  anthOk   = true,
  anthBody = { content: [{ type: "text", text: "Use Macragge Blue." }] },
  images   = {},           // url → { ok, headers, arrayBuffer }
  authThrows = false,
} = {}) {
  return vi.fn(async (url, opts) => {
    const u = url.toString();

    // Auth check
    if (u.includes("/auth/v1/user")) {
      if (authThrows) throw new Error("network error");
      if (!authOk) return fakeResponse(false);
      return fakeResponse(true, { id: userId });
    }

    // Usage read (GET — no explicit method)
    if (u.includes("/rest/v1/ai_usage") && opts?.method !== "POST") {
      const row = used > 0 ? [{ count: used }] : [];
      return fakeResponse(true, row);
    }

    // Usage write (POST)
    if (u.includes("/rest/v1/ai_usage") && opts?.method === "POST") {
      return fakeResponse(true, {});
    }

    // Image fetches
    if (images[u]) {
      const img = images[u];
      return {
        ok: img.ok ?? true,
        headers: { get: (h) => img.contentType ?? "image/jpeg" },
        arrayBuffer: async () => img.bytes ?? new Uint8Array([0xff, 0xd8]).buffer,
      };
    }

    // Anthropic
    if (u.includes("api.anthropic.com")) {
      if (!anthOk) return fakeResponse(false, { error: { message: "overloaded" } });
      return fakeResponse(true, anthBody);
    }

    return fakeResponse(true, {});
  });
}

function fakeResponse(ok, data) {
  return { ok, json: async () => data };
}

// ─── tests ──────────────────────────────────────────────────────────────────

beforeEach(() => { setEnv(); });
afterEach(() => { clearEnv(); vi.restoreAllMocks(); });

describe("method guard", () => {
  it("rejects GET with 405", async () => {
    vi.stubGlobal("fetch", buildFetch());
    const res = mockRes();
    await handler(mockReq({ method: "GET" }), res);
    expect(res._status).toBe(405);
    expect(res._body).toMatchObject({ error: "Method not allowed" });
  });

  it("rejects PUT with 405", async () => {
    vi.stubGlobal("fetch", buildFetch());
    const res = mockRes();
    await handler(mockReq({ method: "PUT" }), res);
    expect(res._status).toBe(405);
  });
});

describe("missing env vars", () => {
  it("returns 500 when ANTHROPIC_API_KEY is absent", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.stubGlobal("fetch", buildFetch());
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(500);
    expect(res._body.error).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("returns 500 when SUPABASE_URL is absent (no VITE_ fallback either)", async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.VITE_SUPABASE_URL;
    vi.stubGlobal("fetch", buildFetch());
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(500);
    expect(res._body.error).toMatch(/Supabase config/);
  });

  it("uses VITE_SUPABASE_URL as fallback when SUPABASE_URL is absent", async () => {
    delete process.env.SUPABASE_URL;
    process.env.VITE_SUPABASE_URL = "https://abc.supabase.co";
    vi.stubGlobal("fetch", buildFetch());
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
  });

  it("returns 500 when SUPABASE_SERVICE_ROLE_KEY is absent", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    vi.stubGlobal("fetch", buildFetch());
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(500);
    expect(res._body.error).toMatch(/Supabase config/);
  });
});

describe("authentication", () => {
  it("returns 401 when Authorization header is missing", async () => {
    vi.stubGlobal("fetch", buildFetch());
    const res = mockRes();
    await handler(mockReq({ headers: {} }), res);
    expect(res._status).toBe(401);
    expect(res._body).toMatchObject({ error: "Not authenticated" });
  });

  it("returns 401 when Supabase rejects the token", async () => {
    vi.stubGlobal("fetch", buildFetch({ authOk: false }));
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(401);
    expect(res._body).toMatchObject({ error: "Invalid session" });
  });

  it("returns 401 when Supabase auth call throws", async () => {
    vi.stubGlobal("fetch", buildFetch({ authThrows: true }));
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(401);
    expect(res._body).toMatchObject({ error: "Auth check failed" });
  });

  it("returns 401 when token is valid but user has no id", async () => {
    vi.stubGlobal("fetch", buildFetch({ userId: null }));
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(401);
    expect(res._body).toMatchObject({ error: "No user" });
  });
});

describe("rate limiting", () => {
  it("returns 429 when daily limit is reached (used === 3)", async () => {
    vi.stubGlobal("fetch", buildFetch({ used: 3 }));
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(429);
    expect(res._body).toMatchObject({ error: "DAILY_LIMIT", limit: 3, used: 3 });
  });

  it("returns 429 when used exceeds limit (used === 5)", async () => {
    vi.stubGlobal("fetch", buildFetch({ used: 5 }));
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(429);
  });

  it("allows request when used === 2 (one slot remaining)", async () => {
    vi.stubGlobal("fetch", buildFetch({ used: 2 }));
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
    expect(res._body.remaining).toBe(0);
  });

  it("treats usage read failure as 0 (proceeds normally)", async () => {
    const fetch = buildFetch({ used: 0 });
    // Override usage read to throw
    let usageReadCalled = false;
    const wrapped = vi.fn(async (url, opts) => {
      if (url.includes("/rest/v1/ai_usage") && opts?.method !== "POST") {
        if (!usageReadCalled) { usageReadCalled = true; throw new Error("DB error"); }
      }
      return fetch(url, opts);
    });
    vi.stubGlobal("fetch", wrapped);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(200);
  });
});

describe("request body validation", () => {
  it("returns 400 when system is missing", async () => {
    vi.stubGlobal("fetch", buildFetch());
    const res = mockRes();
    await handler(mockReq({ body: { userText: "hello" } }), res);
    expect(res._status).toBe(400);
    expect(res._body).toMatchObject({ error: "Missing prompt" });
  });

  it("returns 400 when userText is missing", async () => {
    vi.stubGlobal("fetch", buildFetch());
    const res = mockRes();
    await handler(mockReq({ body: { system: "sys" } }), res);
    expect(res._status).toBe(400);
    expect(res._body).toMatchObject({ error: "Missing prompt" });
  });

  it("returns 400 when body is entirely absent", async () => {
    vi.stubGlobal("fetch", buildFetch());
    const res = mockRes();
    await handler(mockReq({ body: null }), res);
    expect(res._status).toBe(400);
  });
});

describe("SSRF guard (isAllowed)", () => {
  const sbHost = "abc.supabase.co";

  // Convenience: run handler with photoUrls and capture what fetch received for Anthropic
  async function runWithPhotos(photoUrls) {
    const fetchMock = buildFetch();
    vi.stubGlobal("fetch", fetchMock);
    const res = mockRes();
    await handler(
      mockReq({ body: { system: "sys", userText: "text", photoUrls } }),
      res
    );
    const anthropicCall = fetchMock.mock.calls.find(([u]) =>
      u.includes("api.anthropic.com")
    );
    const body = JSON.parse(anthropicCall[1].body);
    return body.messages[0].content;
  }

  it("rejects http:// URLs — no image blocks sent to Anthropic", async () => {
    const content = await runWithPhotos([`http://${sbHost}/storage/v1/img.jpg`]);
    expect(content.filter((b) => b.type === "image")).toHaveLength(0);
  });

  it("rejects https URL with wrong host", async () => {
    const content = await runWithPhotos(["https://evil.com/storage/v1/img.jpg"]);
    expect(content.filter((b) => b.type === "image")).toHaveLength(0);
  });

  it("rejects https URL on correct host but wrong path (not /storage/)", async () => {
    const content = await runWithPhotos([`https://${sbHost}/other/path/img.jpg`]);
    expect(content.filter((b) => b.type === "image")).toHaveLength(0);
  });

  it("rejects malformed URL strings", async () => {
    const content = await runWithPhotos(["not a url at all"]);
    expect(content.filter((b) => b.type === "image")).toHaveLength(0);
  });

  it("accepts valid https URL on correct host under /storage/", async () => {
    const validUrl = `https://${sbHost}/storage/v1/object/sign/ebooks/user/book/img.jpg`;
    const fetchMock = buildFetch({
      images: {
        [validUrl]: { ok: true, contentType: "image/jpeg" },
      },
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = mockRes();
    await handler(
      mockReq({ body: { system: "sys", userText: "text", photoUrls: [validUrl] } }),
      res
    );
    const anthropicCall = fetchMock.mock.calls.find(([u]) =>
      u.includes("api.anthropic.com")
    );
    const body = JSON.parse(anthropicCall[1].body);
    const imgBlocks = body.messages[0].content.filter((b) => b.type === "image");
    expect(imgBlocks).toHaveLength(1);
    expect(imgBlocks[0].source.media_type).toBe("image/jpeg");
  });
});

describe("MIME type guard", () => {
  it("skips image URL that returns non-image Content-Type", async () => {
    const validUrl = "https://abc.supabase.co/storage/v1/img.html";
    const fetchMock = buildFetch({
      images: { [validUrl]: { ok: true, contentType: "text/html" } },
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = mockRes();
    await handler(
      mockReq({ body: { system: "sys", userText: "text", photoUrls: [validUrl] } }),
      res
    );
    const anthropicCall = fetchMock.mock.calls.find(([u]) =>
      u.includes("api.anthropic.com")
    );
    const body = JSON.parse(anthropicCall[1].body);
    const imgBlocks = body.messages[0].content.filter((b) => b.type === "image");
    expect(imgBlocks).toHaveLength(0);
  });

  it("skips image URL that returns non-ok status", async () => {
    const validUrl = "https://abc.supabase.co/storage/v1/img.jpg";
    const fetchMock = buildFetch({
      images: { [validUrl]: { ok: false, contentType: "image/jpeg" } },
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = mockRes();
    await handler(
      mockReq({ body: { system: "sys", userText: "text", photoUrls: [validUrl] } }),
      res
    );
    const anthropicCall = fetchMock.mock.calls.find(([u]) =>
      u.includes("api.anthropic.com")
    );
    const body = JSON.parse(anthropicCall[1].body);
    expect(body.messages[0].content.filter((b) => b.type === "image")).toHaveLength(0);
  });
});

describe("image count cap", () => {
  it("processes at most 6 images when 8 valid URLs are supplied", async () => {
    const makeUrl = (i) => `https://abc.supabase.co/storage/v1/img${i}.jpg`;
    const photoUrls = [1, 2, 3, 4, 5, 6, 7, 8].map(makeUrl);
    const images = Object.fromEntries(
      photoUrls.map((u) => [u, { ok: true, contentType: "image/jpeg" }])
    );
    const fetchMock = buildFetch({ images });
    vi.stubGlobal("fetch", fetchMock);
    const res = mockRes();
    await handler(mockReq({ body: { system: "sys", userText: "text", photoUrls } }), res);
    const anthropicCall = fetchMock.mock.calls.find(([u]) =>
      u.includes("api.anthropic.com")
    );
    const body = JSON.parse(anthropicCall[1].body);
    const imgBlocks = body.messages[0].content.filter((b) => b.type === "image");
    expect(imgBlocks).toHaveLength(6);
  });

  it("skips an oversized image (> ~5MB) instead of failing the request", async () => {
    const makeUrl = (i) => `https://abc.supabase.co/storage/v1/img${i}.jpg`;
    const small = makeUrl(1), big = makeUrl(2);
    const images = {
      [small]: { ok: true, contentType: "image/jpeg", bytes: new Uint8Array([0xff, 0xd8, 0xff]).buffer },
      [big]:   { ok: true, contentType: "image/jpeg", bytes: new Uint8Array(4 * 1024 * 1024).buffer }, // 4 MB raw → too big
    };
    const fetchMock = buildFetch({ images });
    vi.stubGlobal("fetch", fetchMock);
    const res = mockRes();
    await handler(mockReq({ body: { system: "sys", userText: "text", photoUrls: [small, big] } }), res);
    const anthropicCall = fetchMock.mock.calls.find(([u]) => u.includes("api.anthropic.com"));
    const body = JSON.parse(anthropicCall[1].body);
    const imgBlocks = body.messages[0].content.filter((b) => b.type === "image");
    expect(imgBlocks).toHaveLength(1); // the big one was skipped, the request still went through
    expect(res._status).toBe(200);
  });
});

describe("Anthropic errors", () => {
  it("returns 502 when Anthropic responds with non-ok status", async () => {
    vi.stubGlobal("fetch", buildFetch({ anthOk: false }));
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(502);
    expect(res._body.error).toBe("overloaded");
  });

  it("returns 502 when Anthropic call throws", async () => {
    const fetchMock = vi.fn(async (url, opts) => {
      if (url.includes("api.anthropic.com")) throw new Error("timeout");
      return buildFetch()(url, opts);
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = mockRes();
    await handler(mockReq(), res);
    expect(res._status).toBe(502);
    expect(res._body).toMatchObject({ error: "AI request failed" });
  });
});

describe("happy path", () => {
  it("text-only request: returns 200 with content and correct remaining count", async () => {
    vi.stubGlobal("fetch", buildFetch({ used: 1 }));
    const res = mockRes();
    await handler(mockReq({ body: { system: "sys", userText: "suggest colors" } }), res);
    expect(res._status).toBe(200);
    expect(res._body).toMatchObject({
      content: [{ type: "text", text: "Use Macragge Blue." }],
      remaining: 1,  // limit(3) - (used(1) + 1)
    });
  });

  it("uses claude-haiku-4-5-20251001 as default model when not specified", async () => {
    const fetchMock = buildFetch();
    vi.stubGlobal("fetch", fetchMock);
    await handler(mockReq({ body: { system: "sys", userText: "text" } }), mockRes());
    const anthropicCall = fetchMock.mock.calls.find(([u]) =>
      u.includes("api.anthropic.com")
    );
    const body = JSON.parse(anthropicCall[1].body);
    expect(body.model).toBe("claude-haiku-4-5-20251001");
  });

  it("passes caller-specified model to Anthropic", async () => {
    const fetchMock = buildFetch();
    vi.stubGlobal("fetch", fetchMock);
    await handler(
      mockReq({ body: { system: "sys", userText: "text", model: "claude-sonnet-4-6" } }),
      mockRes()
    );
    const anthropicCall = fetchMock.mock.calls.find(([u]) =>
      u.includes("api.anthropic.com")
    );
    const body = JSON.parse(anthropicCall[1].body);
    expect(body.model).toBe("claude-sonnet-4-6");
  });

  it("text-only request: content is sent as a plain string (not array)", async () => {
    const fetchMock = buildFetch();
    vi.stubGlobal("fetch", fetchMock);
    await handler(mockReq({ body: { system: "sys", userText: "text" } }), mockRes());
    const anthropicCall = fetchMock.mock.calls.find(([u]) =>
      u.includes("api.anthropic.com")
    );
    const body = JSON.parse(anthropicCall[1].body);
    expect(body.messages[0].content).toBe("text");
  });

  it("request with photos: content is an array ending with the text block", async () => {
    const validUrl = "https://abc.supabase.co/storage/v1/img.jpg";
    const fetchMock = buildFetch({
      images: { [validUrl]: { ok: true, contentType: "image/png" } },
    });
    vi.stubGlobal("fetch", fetchMock);
    await handler(
      mockReq({ body: { system: "sys", userText: "describe", photoUrls: [validUrl] } }),
      mockRes()
    );
    const anthropicCall = fetchMock.mock.calls.find(([u]) =>
      u.includes("api.anthropic.com")
    );
    const body = JSON.parse(anthropicCall[1].body);
    const content = body.messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    expect(content.at(-1)).toMatchObject({ type: "text", text: "describe" });
    expect(content[0]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/png" } });
  });
});

describe("usage increment", () => {
  it("upserts used+1 after a successful AI call", async () => {
    const fetchMock = buildFetch({ used: 1 });
    vi.stubGlobal("fetch", fetchMock);
    await handler(mockReq(), mockRes());
    const upsertCall = fetchMock.mock.calls.find(
      ([u, opts]) => u.includes("/rest/v1/ai_usage") && opts?.method === "POST"
    );
    expect(upsertCall).toBeDefined();
    const body = JSON.parse(upsertCall[1].body);
    expect(body.count).toBe(2);   // used(1) + 1
    expect(body.user_id).toBe("user-123");
  });

  it("today's date is included in the upsert", async () => {
    const fetchMock = buildFetch();
    vi.stubGlobal("fetch", fetchMock);
    await handler(mockReq(), mockRes());
    const upsertCall = fetchMock.mock.calls.find(
      ([u, opts]) => u.includes("/rest/v1/ai_usage") && opts?.method === "POST"
    );
    const body = JSON.parse(upsertCall[1].body);
    const today = new Date().toISOString().slice(0, 10);
    expect(body.day).toBe(today);
  });

  it("does not increment usage when AI call fails", async () => {
    const fetchMock = buildFetch({ anthOk: false });
    vi.stubGlobal("fetch", fetchMock);
    await handler(mockReq(), mockRes());
    const upsertCall = fetchMock.mock.calls.find(
      ([u, opts]) => u.includes("/rest/v1/ai_usage") && opts?.method === "POST"
    );
    expect(upsertCall).toBeUndefined();
  });
});
