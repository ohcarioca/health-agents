import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──

vi.mock("server-only", () => ({}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

let mockClinicId: string | null = "clinic-1";
vi.mock("@/lib/supabase/server", () => ({
  getClinicId: vi.fn(() => Promise.resolve(mockClinicId)),
}));

import { POST } from "@/app/api/appointments/[id]/complete/route";

// ── Helpers ──

function createRequest(): Request {
  return new Request("http://localhost/api/appointments/appt-1/complete", {
    method: "POST",
  });
}

function createChainWithSingle(
  data: unknown,
  error: { message: string } | null,
) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
  };
}

function createUpdateChain(error: { message: string } | null) {
  return {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error }),
    }),
  };
}

// ── Tests ──

describe("POST /api/appointments/[id]/complete", () => {
  const params = Promise.resolve({ id: "appt-1" });

  beforeEach(() => {
    vi.clearAllMocks();
    mockClinicId = "clinic-1";
  });

  it("returns 401 when not authenticated", async () => {
    mockClinicId = null;

    const response = await POST(createRequest(), { params });
    expect(response.status).toBe(401);

    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 404 when appointment not found", async () => {
    mockFrom.mockReturnValue(
      createChainWithSingle(null, { message: "not found" }),
    );

    const response = await POST(createRequest(), { params });
    expect(response.status).toBe(404);

    const body = await response.json();
    expect(body.error).toBe("Appointment not found");
  });

  it("returns 400 when appointment status is not completable", async () => {
    mockFrom.mockReturnValue(
      createChainWithSingle(
        { id: "appt-1", status: "cancelled" },
        null,
      ),
    );

    const response = await POST(createRequest(), { params });
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toBe(
      'Cannot complete appointment with status "cancelled"',
    );
  });

  it("returns 200 and updates status to completed", async () => {
    const callCount = { appointments: 0 };

    mockFrom.mockImplementation(() => {
      callCount.appointments += 1;

      // First call: select to verify appointment
      if (callCount.appointments === 1) {
        return createChainWithSingle(
          { id: "appt-1", status: "scheduled" },
          null,
        );
      }

      // Second call: update status
      return createUpdateChain(null);
    });

    const response = await POST(createRequest(), { params });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data).toEqual({ id: "appt-1", status: "completed" });
  });

  it("returns 200 when appointment is confirmed", async () => {
    const callCount = { appointments: 0 };

    mockFrom.mockImplementation(() => {
      callCount.appointments += 1;

      if (callCount.appointments === 1) {
        return createChainWithSingle(
          { id: "appt-1", status: "confirmed" },
          null,
        );
      }

      return createUpdateChain(null);
    });

    const response = await POST(createRequest(), { params });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.data).toEqual({ id: "appt-1", status: "completed" });
  });

  it("returns 500 when update fails", async () => {
    const callCount = { appointments: 0 };

    mockFrom.mockImplementation(() => {
      callCount.appointments += 1;

      if (callCount.appointments === 1) {
        return createChainWithSingle(
          { id: "appt-1", status: "scheduled" },
          null,
        );
      }

      return createUpdateChain({ message: "DB error" });
    });

    const response = await POST(createRequest(), { params });
    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body.error).toBe("DB error");
  });
});
