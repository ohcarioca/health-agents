import { describe, it, expect } from "vitest";
import { clinicDataSchema, professionalSchema } from "@/lib/validations/onboarding";

describe("clinicDataSchema", () => {
  it("accepts valid clinic data", () => {
    const result = clinicDataSchema.safeParse({
      name: "Clínica Teste",
      phone: "11999999999",
      address: "Rua Teste, 123",
      city: "São Paulo",
      state: "SP",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = clinicDataSchema.safeParse({
      name: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts minimal data (name only)", () => {
    const result = clinicDataSchema.safeParse({
      name: "My Clinic",
    });
    expect(result.success).toBe(true);
  });
});

describe("professionalSchema", () => {
  it("accepts valid professional", () => {
    const result = professionalSchema.safeParse({
      name: "Dr. João",
      specialty: "Clínico Geral",
      durationMinutes: 30,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = professionalSchema.safeParse({
      name: "",
    });
    expect(result.success).toBe(false);
  });
});
