import { describe, it, expect, vi } from "vitest";
import { isAutoBillingEnabled } from "@/lib/billing/auto-billing";

describe("isAutoBillingEnabled", () => {
  it("returns true when auto_billing is true in settings", async () => {
    const supabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { settings: { auto_billing: true } },
        error: null,
      }),
    } as unknown as Parameters<typeof isAutoBillingEnabled>[0];

    const result = await isAutoBillingEnabled(supabase, "clinic-123");
    expect(result).toBe(true);
  });

  it("returns false when auto_billing is false", async () => {
    const supabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { settings: { auto_billing: false } },
        error: null,
      }),
    } as unknown as Parameters<typeof isAutoBillingEnabled>[0];

    const result = await isAutoBillingEnabled(supabase, "clinic-123");
    expect(result).toBe(false);
  });

  it("returns false when settings is empty object", async () => {
    const supabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { settings: {} },
        error: null,
      }),
    } as unknown as Parameters<typeof isAutoBillingEnabled>[0];

    const result = await isAutoBillingEnabled(supabase, "clinic-123");
    expect(result).toBe(false);
  });

  it("returns false when module_config not found", async () => {
    const supabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { code: "PGRST116" },
      }),
    } as unknown as Parameters<typeof isAutoBillingEnabled>[0];

    const result = await isAutoBillingEnabled(supabase, "clinic-123");
    expect(result).toBe(false);
  });
});
