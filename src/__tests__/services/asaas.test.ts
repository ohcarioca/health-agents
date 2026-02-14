import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createCustomer,
  createCharge,
  getChargeStatus,
  getPixQrCode,
  getBoletoIdentificationField,
  verifyWebhookToken,
} from "@/services/asaas";

const SANDBOX_BASE = "https://api-sandbox.asaas.com/v3";

function mockFetchSuccess(data: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

function mockFetchError(status: number, errors: { description: string }[]) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ errors }),
  });
}

describe("asaas service", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("ASAAS_API_KEY", "test_api_key_123");
    vi.stubEnv("ASAAS_WEBHOOK_TOKEN", "webhook_secret_456");
    vi.stubEnv("ASAAS_ENV", "sandbox");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  describe("createCustomer", () => {
    it("returns customerId on success", async () => {
      global.fetch = mockFetchSuccess({ id: "cus_abc123" });

      const result = await createCustomer({
        name: "João Silva",
        cpfCnpj: "12345678901",
        phone: "11999999999",
        email: "joao@example.com",
      });

      expect(result).toEqual({
        success: true,
        customerId: "cus_abc123",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `${SANDBOX_BASE}/customers`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            access_token: "test_api_key_123",
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            name: "João Silva",
            cpfCnpj: "12345678901",
            phone: "11999999999",
            email: "joao@example.com",
          }),
        })
      );
    });

    it("returns error on API failure", async () => {
      global.fetch = mockFetchError(400, [
        { description: "CPF/CNPJ inválido" },
        { description: "Campo obrigatório" },
      ]);

      const result = await createCustomer({
        name: "Test",
        cpfCnpj: "invalid",
      });

      expect(result).toEqual({
        success: false,
        error: "CPF/CNPJ inválido, Campo obrigatório",
      });
    });
  });

  describe("createCharge", () => {
    it("creates PIX charge and converts cents to BRL", async () => {
      global.fetch = mockFetchSuccess({
        id: "pay_pix_001",
        invoiceUrl: "https://asaas.com/i/pay_pix_001",
        status: "PENDING",
      });

      const result = await createCharge({
        customerId: "cus_abc123",
        billingType: "PIX",
        valueCents: 15000,
        dueDate: "2026-03-01",
        description: "Consulta médica",
      });

      expect(result).toEqual({
        success: true,
        chargeId: "pay_pix_001",
        invoiceUrl: "https://asaas.com/i/pay_pix_001",
        bankSlipUrl: undefined,
        status: "PENDING",
      });

      const callBody = JSON.parse(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
      );
      expect(callBody.value).toBe(150);
      expect(callBody.billingType).toBe("PIX");
      expect(callBody.customer).toBe("cus_abc123");
    });

    it("creates boleto charge with bankSlipUrl", async () => {
      global.fetch = mockFetchSuccess({
        id: "pay_boleto_002",
        invoiceUrl: "https://asaas.com/i/pay_boleto_002",
        bankSlipUrl: "https://asaas.com/b/pay_boleto_002",
        status: "PENDING",
      });

      const result = await createCharge({
        customerId: "cus_abc123",
        billingType: "BOLETO",
        valueCents: 25050,
        dueDate: "2026-03-15",
      });

      expect(result).toEqual({
        success: true,
        chargeId: "pay_boleto_002",
        invoiceUrl: "https://asaas.com/i/pay_boleto_002",
        bankSlipUrl: "https://asaas.com/b/pay_boleto_002",
        status: "PENDING",
      });

      const callBody = JSON.parse(
        (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
      );
      expect(callBody.value).toBe(250.5);
      expect(callBody.billingType).toBe("BOLETO");
    });
  });

  describe("getChargeStatus", () => {
    it("returns status and converts BRL back to cents", async () => {
      global.fetch = mockFetchSuccess({
        status: "RECEIVED",
        paymentDate: "2026-03-01",
        value: 150.0,
      });

      const result = await getChargeStatus("pay_pix_001");

      expect(result).toEqual({
        success: true,
        status: "RECEIVED",
        paymentDate: "2026-03-01",
        valueCents: 15000,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `${SANDBOX_BASE}/payments/pay_pix_001`,
        expect.objectContaining({
          headers: expect.objectContaining({
            access_token: "test_api_key_123",
          }),
        })
      );
    });
  });

  describe("getPixQrCode", () => {
    it("returns payload and encodedImage", async () => {
      global.fetch = mockFetchSuccess({
        payload:
          "00020126580014br.gov.bcb.pix0136a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        encodedImage: "iVBORw0KGgoAAAANSUhEUgAAA...",
        expirationDate: "2026-03-01T23:59:59Z",
      });

      const result = await getPixQrCode("pay_pix_001");

      expect(result).toEqual({
        success: true,
        payload:
          "00020126580014br.gov.bcb.pix0136a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        encodedImage: "iVBORw0KGgoAAAANSUhEUgAAA...",
        expirationDate: "2026-03-01T23:59:59Z",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `${SANDBOX_BASE}/payments/pay_pix_001/pixQrCode`,
        expect.anything()
      );
    });
  });

  describe("getBoletoIdentificationField", () => {
    it("returns identificationField, nossoNumero, and barCode", async () => {
      global.fetch = mockFetchSuccess({
        identificationField: "23793.38128 60000.000003 00000.000400 1 84340000015000",
        nossoNumero: "1234567",
        barCode: "23791843400000150003381286000000000000000040",
      });

      const result = await getBoletoIdentificationField("pay_boleto_002");

      expect(result).toEqual({
        success: true,
        identificationField: "23793.38128 60000.000003 00000.000400 1 84340000015000",
        nossoNumero: "1234567",
        barCode: "23791843400000150003381286000000000000000040",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `${SANDBOX_BASE}/payments/pay_boleto_002/identificationField`,
        expect.anything()
      );
    });
  });

  describe("verifyWebhookToken", () => {
    it("returns true for matching token", () => {
      const result = verifyWebhookToken("webhook_secret_456");
      expect(result).toBe(true);
    });

    it("returns false for mismatched token", () => {
      const result = verifyWebhookToken("wrong_token");
      expect(result).toBe(false);
    });

    it("returns false when ASAAS_WEBHOOK_TOKEN is not configured", () => {
      vi.stubEnv("ASAAS_WEBHOOK_TOKEN", "");
      delete process.env.ASAAS_WEBHOOK_TOKEN;
      const result = verifyWebhookToken("any_token");
      expect(result).toBe(false);
    });
  });
});
