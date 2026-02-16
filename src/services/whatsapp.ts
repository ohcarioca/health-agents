import "server-only";
import crypto from "crypto";

const API_VERSION = "v21.0";
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

export interface WhatsAppCredentials {
  phoneNumberId: string;
  accessToken: string;
}

interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendTextMessage(
  to: string,
  text: string,
  credentials: WhatsAppCredentials
): Promise<SendMessageResult> {
  if (!credentials.phoneNumberId || !credentials.accessToken) {
    return { success: false, error: "missing WhatsApp configuration" };
  }

  try {
    const response = await fetch(
      `${BASE_URL}/${credentials.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: text },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[whatsapp] send failed:", response.status, errorBody);
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = (await response.json()) as { messages?: Array<{ id: string }> };
    return {
      success: true,
      messageId: data.messages?.[0]?.id,
    };
  } catch (err) {
    console.error("[whatsapp] send error:", err);
    return { success: false, error: String(err) };
  }
}

export async function sendTemplateMessage(
  to: string,
  templateName: string,
  language: string,
  params: string[],
  credentials: WhatsAppCredentials
): Promise<SendMessageResult> {
  if (!credentials.phoneNumberId || !credentials.accessToken) {
    return { success: false, error: "missing WhatsApp configuration" };
  }

  try {
    const response = await fetch(
      `${BASE_URL}/${credentials.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: templateName,
            language: { code: language },
            components: [
              {
                type: "body",
                parameters: params.map((p) => ({
                  type: "text",
                  text: p,
                })),
              },
            ],
          },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[whatsapp] template send failed:", response.status, errorBody);
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = (await response.json()) as { messages?: Array<{ id: string }> };
    return {
      success: true,
      messageId: data.messages?.[0]?.id,
    };
  } catch (err) {
    console.error("[whatsapp] template send error:", err);
    return { success: false, error: String(err) };
  }
}

export function verifySignature(payload: string, signature: string): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    console.error("[whatsapp] META_APP_SECRET not configured");
    return false;
  }

  const expectedSignature =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(payload).digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}
