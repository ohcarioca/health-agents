/**
 * Phone number normalization utilities for Brazilian numbers.
 *
 * Brazilian phone format:
 *   - Country code: 55
 *   - Area code (DDD): 2 digits
 *   - Mobile: 9 digits (9th digit prepended), starts with 9[6-9]
 *   - Landline: 8 digits, starts with [2-5]
 *
 * Old mobile format (without 9th digit): DD + 8 digits starting with [6-9]
 * New mobile format (with 9th digit):    DD + 9 + 8 digits starting with [6-9]
 */

/**
 * Strip all non-digit characters from a phone string.
 */
export function stripNonDigits(phone: string): string {
  return phone.replace(/\D/g, "");
}

/**
 * Check if a local number (after DDD) looks like a mobile number.
 * Brazilian mobile numbers start with 6, 7, 8, or 9.
 * Landlines start with 2, 3, 4, or 5.
 */
function isMobileNumber(firstDigitAfterDDD: string): boolean {
  return /^[6-9]/.test(firstDigitAfterDDD);
}

/**
 * Normalize a Brazilian phone number to canonical format:
 * - Strips all non-digit characters
 * - Adds the 9th digit for mobile numbers missing it
 *
 * Does NOT add/remove country code — preserves whatever format was given.
 *
 * Examples:
 *   "+55 (51) 8120-8117" → "5551981208117" (added 9th digit)
 *   "5551981208117"      → "5551981208117" (already canonical)
 *   "5181208117"          → "51981208117"   (added 9th digit, no country code)
 *   "555132218117"        → "555132218117"  (landline, unchanged)
 */
export function normalizeBRPhone(phone: string): string {
  const digits = stripNonDigits(phone);

  // With country code 55: 12 digits = possibly missing 9th digit
  if (digits.startsWith("55") && digits.length === 12) {
    const numberAfterDDD = digits.slice(4);
    if (isMobileNumber(numberAfterDDD)) {
      return digits.slice(0, 4) + "9" + numberAfterDDD;
    }
  }

  // Without country code: 10 digits = possibly missing 9th digit
  if (!digits.startsWith("55") && digits.length === 10) {
    const numberAfterDDD = digits.slice(2);
    if (isMobileNumber(numberAfterDDD)) {
      return digits.slice(0, 2) + "9" + numberAfterDDD;
    }
  }

  return digits;
}

/**
 * Generate all phone variants for database lookup.
 * Returns both with and without the 9th digit for mobile numbers,
 * so a query can match either format stored in the database.
 *
 * Example: "5551981208117" → ["5551981208117", "555181208117"]
 * Example: "555132218117"  → ["555132218117"] (landline, no variant)
 */
export function phoneLookupVariants(phone: string): string[] {
  const digits = stripNonDigits(phone);
  const variants = new Set<string>([digits]);

  // With country code 55
  if (digits.startsWith("55")) {
    const ddd = digits.slice(2, 4);
    const localNumber = digits.slice(4);

    if (localNumber.length === 9 && localNumber.startsWith("9") && isMobileNumber(localNumber.slice(1))) {
      // Has 9th digit → add variant without it
      variants.add("55" + ddd + localNumber.slice(1));
    } else if (localNumber.length === 8 && isMobileNumber(localNumber)) {
      // Missing 9th digit → add variant with it
      variants.add("55" + ddd + "9" + localNumber);
    }
    return Array.from(variants);
  }

  // Without country code
  if (digits.length >= 10 && digits.length <= 11) {
    const ddd = digits.slice(0, 2);
    const localNumber = digits.slice(2);

    if (localNumber.length === 9 && localNumber.startsWith("9") && isMobileNumber(localNumber.slice(1))) {
      // Has 9th digit → add variant without it
      variants.add(ddd + localNumber.slice(1));
    } else if (localNumber.length === 8 && isMobileNumber(localNumber)) {
      // Missing 9th digit → add variant with it
      variants.add(ddd + "9" + localNumber);
    }
  }

  return Array.from(variants);
}
