import "server-only";
import crypto from "crypto";

const SANDBOX_BASE_URL = "https://api-sandbox.asaas.com/v3";
const PRODUCTION_BASE_URL = "https://api.asaas.com/v3";

function getBaseUrl(): string {
  const env = process.env.ASAAS_ENV ?? "sandbox";
  return env === "production" ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL;
}

function getApiKey(): string {
  return process.env.ASAAS_API_KEY ?? "";
}

interface AsaasErrorItem {
  description: string;
}

interface AsaasErrorResponse {
  errors?: AsaasErrorItem[];
}

function extractErrorMessage(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "errors" in body &&
    Array.isArray((body as AsaasErrorResponse).errors)
  ) {
    const errors = (body as AsaasErrorResponse).errors!;
    return errors.map((e) => e.description).join(", ");
  }
  return "unknown Asaas API error";
}

async function asaasFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { ok: false, error: "missing ASAAS_API_KEY configuration" };
  }

  const url = `${getBaseUrl()}${path}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        access_token: apiKey,
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorBody: unknown = await response.json().catch(() => null);
      const message = errorBody
        ? extractErrorMessage(errorBody)
        : `HTTP ${response.status}`;
      console.error(`[asaas] API error (${response.status}):`, message);
      return { ok: false, error: message };
    }

    const data = (await response.json()) as T;
    return { ok: true, data };
  } catch (err) {
    console.error("[asaas] fetch error:", err);
    return { ok: false, error: String(err) };
  }
}

// --- Interfaces ---

interface CreateCustomerParams {
  name: string;
  cpfCnpj: string;
  phone?: string;
  email?: string;
  externalReference?: string;
}

interface CreateCustomerResult {
  success: boolean;
  customerId?: string;
  error?: string;
}

interface CreateChargeParams {
  customerId: string;
  billingType: "PIX" | "BOLETO" | "CREDIT_CARD" | "UNDEFINED";
  valueCents: number;
  dueDate: string;
  description?: string;
  externalReference?: string;
}

interface CreateChargeResult {
  success: boolean;
  chargeId?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  status?: string;
  error?: string;
}

interface GetChargeStatusResult {
  success: boolean;
  status?: string;
  paymentDate?: string;
  valueCents?: number;
  error?: string;
}

interface GetPixQrCodeResult {
  success: boolean;
  payload?: string;
  encodedImage?: string;
  expirationDate?: string;
  error?: string;
}

interface GetBoletoIdentificationFieldResult {
  success: boolean;
  identificationField?: string;
  nossoNumero?: string;
  barCode?: string;
  error?: string;
}

// --- API response shapes ---

interface AsaasCustomerResponse {
  id: string;
}

interface AsaasChargeResponse {
  id: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  status?: string;
}

interface AsaasChargeStatusResponse {
  status: string;
  paymentDate?: string;
  value: number;
}

interface AsaasPixQrCodeResponse {
  payload: string;
  encodedImage: string;
  expirationDate: string;
}

interface AsaasBoletoIdentificationFieldResponse {
  identificationField: string;
  nossoNumero: string;
  barCode: string;
}

// --- Public Functions ---

export async function createCustomer(
  params: CreateCustomerParams
): Promise<CreateCustomerResult> {
  const body: Record<string, string> = {
    name: params.name,
    cpfCnpj: params.cpfCnpj,
  };

  if (params.phone) body.phone = params.phone;
  if (params.email) body.email = params.email;
  if (params.externalReference)
    body.externalReference = params.externalReference;

  const result = await asaasFetch<AsaasCustomerResponse>("/customers", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  return { success: true, customerId: result.data.id };
}

export async function createCharge(
  params: CreateChargeParams
): Promise<CreateChargeResult> {
  const valueBrl = params.valueCents / 100;

  const body: Record<string, unknown> = {
    customer: params.customerId,
    billingType: params.billingType,
    value: valueBrl,
    dueDate: params.dueDate,
  };

  if (params.description) body.description = params.description;
  if (params.externalReference)
    body.externalReference = params.externalReference;

  const result = await asaasFetch<AsaasChargeResponse>("/payments", {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    chargeId: result.data.id,
    invoiceUrl: result.data.invoiceUrl,
    bankSlipUrl: result.data.bankSlipUrl,
    status: result.data.status,
  };
}

export async function getChargeStatus(
  chargeId: string
): Promise<GetChargeStatusResult> {
  const result = await asaasFetch<AsaasChargeStatusResponse>(
    `/payments/${chargeId}`
  );

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    status: result.data.status,
    paymentDate: result.data.paymentDate,
    valueCents: Math.round(result.data.value * 100),
  };
}

export async function getPixQrCode(
  chargeId: string
): Promise<GetPixQrCodeResult> {
  const result = await asaasFetch<AsaasPixQrCodeResponse>(
    `/payments/${chargeId}/pixQrCode`
  );

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    payload: result.data.payload,
    encodedImage: result.data.encodedImage,
    expirationDate: result.data.expirationDate,
  };
}

export async function getBoletoIdentificationField(
  chargeId: string
): Promise<GetBoletoIdentificationFieldResult> {
  const result = await asaasFetch<AsaasBoletoIdentificationFieldResponse>(
    `/payments/${chargeId}/identificationField`
  );

  if (!result.ok) {
    return { success: false, error: result.error };
  }

  return {
    success: true,
    identificationField: result.data.identificationField,
    nossoNumero: result.data.nossoNumero,
    barCode: result.data.barCode,
  };
}

export function verifyWebhookToken(receivedToken: string): boolean {
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;
  if (!expectedToken) {
    console.error("[asaas] ASAAS_WEBHOOK_TOKEN not configured");
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(receivedToken),
      Buffer.from(expectedToken)
    );
  } catch {
    return false;
  }
}

export type {
  CreateCustomerParams,
  CreateCustomerResult,
  CreateChargeParams,
  CreateChargeResult,
  GetChargeStatusResult,
  GetPixQrCodeResult,
  GetBoletoIdentificationFieldResult,
};
