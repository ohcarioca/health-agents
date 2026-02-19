import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──

vi.mock("server-only", () => ({}));
vi.mock("@langchain/openai", () => ({ ChatOpenAI: vi.fn() }));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("@/lib/agents/outbound", () => ({
  sendOutboundMessage: vi.fn().mockResolvedValue({ success: true }),
  isWithinBusinessHours: vi.fn().mockReturnValue(true),
}));

import { GET } from "@/app/api/cron/nps/route";
import { sendOutboundMessage } from "@/lib/agents/outbound";

// ── Helpers ──

const CRON_SECRET = "test-cron-secret-123";

function createRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) {
    headers.set("Authorization", authHeader);
  }
  return new Request("http://localhost/api/cron/nps", {
    method: "GET",
    headers,
  });
}

// ── Fixtures ──

const COMPLETED_APPOINTMENT = {
  id: "appt-1",
  clinic_id: "clinic-1",
  patient_id: "patient-1",
  professional_id: "prof-1",
  service_id: null,
  starts_at: "2026-02-12T14:00:00Z",
  ends_at: "2026-02-12T15:00:00Z",
  status: "completed",
  google_event_id: null,
  cancellation_reason: null,
  created_at: "2026-02-01T10:00:00Z",
  updated_at: "2026-02-13T08:00:00Z",
};

const PATIENT = {
  id: "patient-1",
  clinic_id: "clinic-1",
  name: "Maria Silva",
  phone: "5511999998888",
  email: null,
  date_of_birth: null,
  notes: null,
  custom_fields: {},
  last_visit_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const PROFESSIONAL = {
  name: "Dr. Carlos Santos",
};

const CLINIC = {
  timezone: "America/Sao_Paulo",
  is_active: true,
  whatsapp_phone_number_id: "123456789",
  whatsapp_access_token: "test-access-token",
};

const CONVERSATION = {
  id: "conv-1",
};

// ── Tests ──

describe("GET /api/cron/nps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", CRON_SECRET);
  });

  it("returns 401 without valid CRON_SECRET", async () => {
    const response = await GET(createRequest());
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 401 with wrong CRON_SECRET", async () => {
    const response = await GET(createRequest("Bearer wrong-secret"));
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 200 with valid CRON_SECRET when no completed appointments", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "module_configs") return createModuleConfigsMock();
      return createChainWithData([], null);
    });

    const response = await GET(createRequest(`Bearer ${CRON_SECRET}`));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.processed).toBe(0);
    expect(body.data.sent).toBe(0);
    expect(body.data.skipped).toBe(0);
  });

  it("sends NPS survey for a completed appointment", async () => {
    const callCounts: Record<string, number> = {};

    mockFrom.mockImplementation((table: string) => {
      callCounts[table] = (callCounts[table] ?? 0) + 1;

      if (table === "module_configs") return createModuleConfigsMock();

      if (table === "appointments") {
        // First call: select completed appointments
        return createChainWithData([COMPLETED_APPOINTMENT], null);
      }

      if (table === "nps_responses") {
        const callNum = callCounts[table];

        // First call: check if NPS already exists — no existing record
        if (callNum === 1) {
          return createChainWithMaybeSingle(null, null);
        }

        // Second call: insert placeholder
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }

      if (table === "patients") {
        return createChainWithSingle(PATIENT, null);
      }

      if (table === "professionals") {
        return createChainWithSingle(PROFESSIONAL, null);
      }

      if (table === "clinics") {
        return createChainWithSingle(CLINIC, null);
      }

      if (table === "conversations") {
        const callNum = callCounts[table] ?? 1;

        // First call: find existing conversation
        if (callNum === 1) {
          return createChainWithMaybeSingle(CONVERSATION, null);
        }

        // Second call: update current_module
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }

      return createChainWithData([], null);
    });

    const response = await GET(createRequest(`Bearer ${CRON_SECRET}`));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.processed).toBe(1);
    expect(body.data.sent).toBe(1);
    expect(body.data.skipped).toBe(0);

    // Verify sendOutboundMessage was called with correct params
    expect(sendOutboundMessage).toHaveBeenCalledTimes(1);
    const callArgs = (sendOutboundMessage as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const options = callArgs[1];
    expect(options.clinicId).toBe("clinic-1");
    expect(options.patientId).toBe("patient-1");
    expect(options.patientPhone).toBe("5511999998888");
    expect(options.text).toContain("Maria");
    expect(options.text).toContain("Dr. Carlos Santos");
    expect(options.text).toContain("0 a 10");
    expect(options.skipBusinessHoursCheck).toBe(true);
  });

  it("skips appointment that already has NPS response", async () => {
    const callCounts: Record<string, number> = {};

    mockFrom.mockImplementation((table: string) => {
      callCounts[table] = (callCounts[table] ?? 0) + 1;

      if (table === "module_configs") return createModuleConfigsMock();

      if (table === "appointments") {
        return createChainWithData([COMPLETED_APPOINTMENT], null);
      }

      if (table === "nps_responses") {
        // NPS response already exists
        return createChainWithMaybeSingle({ id: "nps-1" }, null);
      }

      return createChainWithData([], null);
    });

    const response = await GET(createRequest(`Bearer ${CRON_SECRET}`));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.processed).toBe(1);
    expect(body.data.sent).toBe(0);
    expect(body.data.skipped).toBe(1);

    expect(sendOutboundMessage).not.toHaveBeenCalled();
  });
});

// ── Chain helpers ──

/** module_configs: .select().eq("module_type",...).eq("enabled",...) → [] */
function createModuleConfigsMock() {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }),
  };
}

/**
 * Creates a chainable that resolves with array data (for queries that return
 * arrays via .select().eq().gte() without .single()/.maybeSingle()).
 */
function createChainWithData(
  data: unknown,
  error: { message: string } | null
) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        gte: vi.fn().mockResolvedValue({ data, error }),
      }),
    }),
  };
}

/**
 * Creates a chainable that ends in .single() for fetching one row.
 */
function createChainWithSingle(
  data: unknown,
  error: { message: string } | null
) {
  const singleFn = vi.fn().mockResolvedValue({ data, error });

  const chainable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: singleFn,
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };

  return chainable;
}

/**
 * Creates a chainable for lookups that use .maybeSingle() at the end.
 */
function createChainWithMaybeSingle(
  data: unknown,
  error: { message: string } | null
) {
  const maybeSingleFn = vi.fn().mockResolvedValue({ data, error });

  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: maybeSingleFn,
  };
}
