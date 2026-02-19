import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──

vi.mock("server-only", () => ({}));
vi.mock("@langchain/openai", () => ({ ChatOpenAI: vi.fn() }));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock("@/lib/agents/outbound", () => ({
  sendOutboundTemplate: vi.fn().mockResolvedValue({ success: true }),
  isWithinBusinessHours: vi.fn().mockReturnValue(true),
}));

import { GET } from "@/app/api/cron/confirmations/route";
import { sendOutboundTemplate } from "@/lib/agents/outbound";

// ── Helpers ──

const CRON_SECRET = "test-cron-secret-123";

function createRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader) {
    headers.set("Authorization", authHeader);
  }
  return new Request("http://localhost/api/cron/confirmations", {
    method: "GET",
    headers,
  });
}

interface MockChainConfig {
  selectData?: unknown;
  selectError?: { message: string } | null;
  insertData?: unknown;
  insertError?: { message: string } | null;
  updateError?: { message: string } | null;
}

function createMockChain(config: MockChainConfig = {}) {
  const {
    selectData = null,
    selectError = null,
    insertData = null,
    insertError = null,
    updateError = null,
  } = config;

  const terminal = {
    single: vi.fn().mockResolvedValue({ data: selectData, error: selectError }),
    maybeSingle: vi.fn().mockResolvedValue({ data: selectData, error: selectError }),
  };

  const chainable = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: terminal.single,
    maybeSingle: terminal.maybeSingle,
  };

  // Override insert to also return chainable (for .select("id").single() after insert)
  chainable.insert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: insertData, error: insertError }),
    }),
  });

  // Override update to return a chainable eq
  chainable.update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: updateError }),
  });

  return chainable;
}

// ── Fixtures ──

const PENDING_ENTRY = {
  id: "cq-1",
  clinic_id: "clinic-1",
  appointment_id: "appt-1",
  stage: "24h",
  status: "pending",
  scheduled_at: "2026-02-12T10:00:00Z",
  sent_at: null,
  response: null,
  attempts: 0,
  created_at: "2026-02-11T10:00:00Z",
};

const APPOINTMENT = {
  id: "appt-1",
  clinic_id: "clinic-1",
  patient_id: "patient-1",
  professional_id: "prof-1",
  service_id: null,
  starts_at: "2026-02-13T14:00:00Z",
  ends_at: "2026-02-13T15:00:00Z",
  status: "scheduled",
  google_event_id: null,
  cancellation_reason: null,
  created_at: "2026-02-01T10:00:00Z",
  updated_at: "2026-02-01T10:00:00Z",
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

describe("GET /api/cron/confirmations", () => {
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

  it("returns 200 with valid CRON_SECRET when no pending confirmations", async () => {
    // Mock confirmation_queue query returning empty array
    mockFrom.mockReturnValue(
      createChainWithData([], null)
    );

    const response = await GET(createRequest(`Bearer ${CRON_SECRET}`));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.processed).toBe(0);
    expect(body.data.sent).toBe(0);
    expect(body.data.failed).toBe(0);
  });

  it("processes a pending confirmation successfully", async () => {
    // Set up table-specific mock responses
    const callCounts: Record<string, number> = {};

    mockFrom.mockImplementation((table: string) => {
      callCounts[table] = (callCounts[table] ?? 0) + 1;

      if (table === "confirmation_queue") {
        const callNum = callCounts[table];

        // First call: select pending entries
        if (callNum === 1) {
          return createChainWithData([PENDING_ENTRY], null);
        }

        // Subsequent calls: update (processing, then sent)
        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }

      if (table === "appointments") {
        return createChainWithSingle(APPOINTMENT, null);
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
        const callNum = callCounts[table];

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

      return createMockChain();
    });

    const response = await GET(createRequest(`Bearer ${CRON_SECRET}`));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.processed).toBe(1);
    expect(body.data.sent).toBe(1);
    expect(body.data.failed).toBe(0);

    // Verify sendOutboundTemplate was called with correct params
    expect(sendOutboundTemplate).toHaveBeenCalledTimes(1);
    const callArgs = (sendOutboundTemplate as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const options = callArgs[1];
    expect(options.clinicId).toBe("clinic-1");
    expect(options.patientId).toBe("patient-1");
    expect(options.patientPhone).toBe("5511999998888");
    expect(options.templateName).toBe("lembrete_da_sua_consulta");
    expect(options.templateLanguage).toBe("pt_BR");
    expect(options.templateParams[0]).toBe("Maria");
    expect(options.templateParams[1]).toBe("Dr. Carlos Santos");
    expect(options.skipBusinessHoursCheck).toBe(true);
  });

  it("marks entry as failed when appointment is cancelled", async () => {
    const callCounts: Record<string, number> = {};

    mockFrom.mockImplementation((table: string) => {
      callCounts[table] = (callCounts[table] ?? 0) + 1;

      if (table === "confirmation_queue") {
        const callNum = callCounts[table];

        if (callNum === 1) {
          return createChainWithData([PENDING_ENTRY], null);
        }

        return {
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }

      if (table === "appointments") {
        return createChainWithSingle(
          { ...APPOINTMENT, status: "cancelled" },
          null
        );
      }

      return createMockChain();
    });

    const response = await GET(createRequest(`Bearer ${CRON_SECRET}`));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data.processed).toBe(1);
    expect(body.data.sent).toBe(0);
    expect(body.data.failed).toBe(1);

    expect(sendOutboundTemplate).not.toHaveBeenCalled();
  });
});

// ── Chain helpers ──

/**
 * Creates a chainable that resolves with array data (for queries that return
 * arrays via .select().eq().lte() without .single()/.maybeSingle()).
 */
function createChainWithData(
  data: unknown,
  error: { message: string } | null
) {
  // The confirmation_queue query uses .select().eq().lte() and resolves directly
  // (no .single() or .maybeSingle()) — so the terminal chainable method is .lte()
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        lte: vi.fn().mockResolvedValue({ data, error }),
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
 * Creates a chainable for conversation lookup that uses .order().limit().maybeSingle().
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
