import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──

vi.mock("server-only", () => ({}));

const mockUser = { id: "user-1" };
const mockGetUser = vi.fn().mockResolvedValue({ data: { user: mockUser } });

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn().mockResolvedValue({
    auth: { getUser: () => mockGetUser() },
  }),
}));

// Track mock state for each test
let membershipResult: Record<string, unknown> = { data: { clinic_id: "clinic-1" }, error: null };
let invoiceListResult: Record<string, unknown> = { data: [], error: null, count: 0 };
let invoiceSingleResult: Record<string, unknown> = { data: null, error: null };

// Track calls to filter methods
const filterCalls: { method: string; args: unknown[] }[] = [];

function createSupabaseMock() {
  const from = vi.fn((table: string) => {
    const target = table === "clinic_users" ? "membership" : "invoices";

    const builder = new Proxy({} as Record<string, unknown>, {
      get(_target, prop: string) {
        if (prop === "then") {
          // Thenable: resolves when awaited
          return (resolve: (v: unknown) => void) => {
            const result = target === "membership" ? membershipResult : invoiceListResult;
            return Promise.resolve(result).then(resolve);
          };
        }
        if (prop === "single") {
          return () => {
            const result = target === "membership" ? membershipResult : invoiceSingleResult;
            return Promise.resolve(result);
          };
        }
        // Track filter calls
        return (...args: unknown[]) => {
          if (["eq", "ilike", "gte"].includes(prop)) {
            filterCalls.push({ method: prop, args });
          }
          return builder;
        };
      },
    });

    return builder;
  });

  return { from };
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => createSupabaseMock()),
}));

import { GET, POST } from "@/app/api/invoices/route";

// ── Helpers ──

function createRequest(
  method: string,
  url = "http://localhost/api/invoices",
  body?: Record<string, unknown>
): Request {
  const init: RequestInit = { method };
  if (body) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

// ── Tests ──

describe("GET /api/invoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    filterCalls.length = 0;
    mockGetUser.mockResolvedValue({ data: { user: mockUser } });
    membershipResult = { data: { clinic_id: "clinic-1" }, error: null };
    invoiceListResult = { data: [], error: null, count: 0 };
    invoiceSingleResult = { data: null, error: null };
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });

    const req = createRequest("GET");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 when user has no clinic membership", async () => {
    membershipResult = { data: null, error: null };

    const req = createRequest("GET");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns invoices with count for authenticated user", async () => {
    const invoiceData = [
      { id: "inv-1", amount_cents: 15000, status: "pending", patients: { name: "John" }, payment_links: [] },
    ];
    invoiceListResult = { data: invoiceData, error: null, count: 1 };

    const req = createRequest("GET");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual(invoiceData);
    expect(json.count).toBe(1);
  });

  it("filters by status when provided", async () => {
    const req = createRequest("GET", "http://localhost/api/invoices?status=paid");
    await GET(req);

    const statusCalls = filterCalls.filter((c) => c.method === "eq" && c.args[0] === "status");
    expect(statusCalls).toHaveLength(1);
    expect(statusCalls[0].args[1]).toBe("paid");
  });

  it("does not filter when status is 'all'", async () => {
    const req = createRequest("GET", "http://localhost/api/invoices?status=all");
    await GET(req);

    const statusCalls = filterCalls.filter((c) => c.method === "eq" && c.args[0] === "status");
    expect(statusCalls).toHaveLength(0);
  });

  it("applies search filter when query is 2+ characters", async () => {
    const req = createRequest("GET", "http://localhost/api/invoices?search=Jo");
    await GET(req);

    const ilikeCalls = filterCalls.filter((c) => c.method === "ilike");
    expect(ilikeCalls).toHaveLength(1);
    expect(ilikeCalls[0].args).toEqual(["patients.name", "%Jo%"]);
  });

  it("skips search filter for single-character query", async () => {
    const req = createRequest("GET", "http://localhost/api/invoices?search=J");
    await GET(req);

    const ilikeCalls = filterCalls.filter((c) => c.method === "ilike");
    expect(ilikeCalls).toHaveLength(0);
  });

  it("applies period filter for this-month", async () => {
    const req = createRequest("GET", "http://localhost/api/invoices?period=this-month");
    await GET(req);

    const gteCalls = filterCalls.filter((c) => c.method === "gte" && c.args[0] === "due_date");
    expect(gteCalls).toHaveLength(1);
    expect(gteCalls[0].args[1]).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("returns KPI data when kpi=true", async () => {
    const kpiData = [
      { amount_cents: 15000, status: "paid" },
      { amount_cents: 10000, status: "pending" },
    ];
    invoiceListResult = { data: kpiData, error: null };

    const req = createRequest("GET", "http://localhost/api/invoices?kpi=true");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual(kpiData);
  });

  it("returns 500 on database error", async () => {
    invoiceListResult = { data: null, error: { message: "DB error" }, count: 0 };

    const req = createRequest("GET");
    const res = await GET(req);

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("DB error");
  });
});

describe("POST /api/invoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    filterCalls.length = 0;
    mockGetUser.mockResolvedValue({ data: { user: mockUser } });
    membershipResult = { data: { clinic_id: "clinic-1" }, error: null };
    invoiceSingleResult = { data: { id: "new-inv", amount_cents: 15000, status: "pending" }, error: null };
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/invoices", {
      method: "POST",
      body: "not-json{{{",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid JSON");
  });

  it("returns 400 for invalid input", async () => {
    const req = createRequest("POST", "http://localhost/api/invoices", {
      patient_id: "not-uuid",
      amount_cents: -5,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Validation failed");
  });

  it("creates invoice with valid input", async () => {
    const req = createRequest("POST", "http://localhost/api/invoices", {
      patient_id: "550e8400-e29b-41d4-a716-446655440000",
      amount_cents: 15000,
      due_date: "2026-03-15",
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.data.id).toBe("new-inv");
  });

  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });

    const req = createRequest("POST", "http://localhost/api/invoices", {
      patient_id: "550e8400-e29b-41d4-a716-446655440000",
      amount_cents: 15000,
      due_date: "2026-03-15",
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 500 on database insert error", async () => {
    invoiceSingleResult = { data: null, error: { message: "Insert failed" } };

    const req = createRequest("POST", "http://localhost/api/invoices", {
      patient_id: "550e8400-e29b-41d4-a716-446655440000",
      amount_cents: 15000,
      due_date: "2026-03-15",
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
