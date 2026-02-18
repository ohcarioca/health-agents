import { describe, it, expect } from "vitest";
import {
  stripNonDigits,
  normalizeBRPhone,
  phoneLookupVariants,
} from "@/lib/utils/phone";

describe("stripNonDigits", () => {
  it("removes +, spaces, dashes, parentheses", () => {
    expect(stripNonDigits("+55 (51) 98120-8117")).toBe("5551981208117");
  });

  it("returns empty string for empty input", () => {
    expect(stripNonDigits("")).toBe("");
  });

  it("leaves digits-only input unchanged", () => {
    expect(stripNonDigits("5551981208117")).toBe("5551981208117");
  });
});

describe("normalizeBRPhone", () => {
  it("strips non-digits", () => {
    expect(normalizeBRPhone("+55 51 98120-8117")).toBe("5551981208117");
  });

  it("adds 9th digit to 12-digit mobile with country code", () => {
    expect(normalizeBRPhone("555181208117")).toBe("5551981208117");
  });

  it("does NOT add 9th digit to landline (first local digit is 2-5)", () => {
    expect(normalizeBRPhone("555132218117")).toBe("555132218117");
  });

  it("keeps 13-digit mobile with country code unchanged", () => {
    expect(normalizeBRPhone("5551981208117")).toBe("5551981208117");
  });

  it("adds 9th digit to 10-digit mobile without country code", () => {
    expect(normalizeBRPhone("5181208117")).toBe("51981208117");
  });

  it("does NOT add 9th digit to 10-digit landline without country code", () => {
    expect(normalizeBRPhone("5132218117")).toBe("5132218117");
  });

  it("keeps 11-digit mobile without country code unchanged", () => {
    expect(normalizeBRPhone("51981208117")).toBe("51981208117");
  });

  it("handles number with + prefix", () => {
    expect(normalizeBRPhone("+555181208117")).toBe("5551981208117");
  });

  it("handles formatted international number", () => {
    expect(normalizeBRPhone("+55 11 98765-0003")).toBe("5511987650003");
  });

  it("handles already canonical number", () => {
    expect(normalizeBRPhone("5511987650003")).toBe("5511987650003");
  });
});

describe("phoneLookupVariants", () => {
  it("returns both variants for 13-digit mobile with country code", () => {
    const variants = phoneLookupVariants("5551981208117");
    expect(variants).toContain("5551981208117");
    expect(variants).toContain("555181208117");
    expect(variants).toHaveLength(2);
  });

  it("returns both variants for 12-digit mobile with country code", () => {
    const variants = phoneLookupVariants("555181208117");
    expect(variants).toContain("555181208117");
    expect(variants).toContain("5551981208117");
    expect(variants).toHaveLength(2);
  });

  it("returns both variants for 11-digit mobile without country code", () => {
    const variants = phoneLookupVariants("51981208117");
    expect(variants).toContain("51981208117");
    expect(variants).toContain("5181208117");
    expect(variants).toHaveLength(2);
  });

  it("returns both variants for 10-digit mobile without country code", () => {
    const variants = phoneLookupVariants("5181208117");
    expect(variants).toContain("5181208117");
    expect(variants).toContain("51981208117");
    expect(variants).toHaveLength(2);
  });

  it("returns single variant for landline (no 9th digit logic)", () => {
    const variants = phoneLookupVariants("555132218117");
    expect(variants).toHaveLength(1);
    expect(variants).toContain("555132218117");
  });

  it("returns single variant for landline without country code", () => {
    const variants = phoneLookupVariants("5132218117");
    expect(variants).toHaveLength(1);
    expect(variants).toContain("5132218117");
  });

  it("strips non-digits before generating variants", () => {
    const variants = phoneLookupVariants("+55 51 98120-8117");
    expect(variants).toContain("5551981208117");
    expect(variants).toContain("555181208117");
  });

  it("handles SP area code (11)", () => {
    const variants = phoneLookupVariants("5511987650003");
    expect(variants).toContain("5511987650003");
    expect(variants).toContain("551187650003");
    expect(variants).toHaveLength(2);
  });
});
