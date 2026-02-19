/** Mask CPF: 12345678900 → ***.***.*89-00 */
export function maskCPF(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return cpf;
  return `***.***.*${digits.slice(7, 9)}-${digits.slice(9)}`;
}
