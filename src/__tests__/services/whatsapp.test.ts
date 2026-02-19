import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import {
  sendTextMessage,
  sendTemplateMessage,
  type WhatsAppCredentials,
} from "@/services/whatsapp";

const BASE_URL = "https://graph.facebook.com/v21.0";

const validCredentials: WhatsAppCredentials = {
  phoneNumberId: "123456789",
  accessToken: "test_access_token_abc",
};

function mockFetchSuccess(data: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

function mockFetchError(status: number, body: string) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    text: () => Promise.resolve(body),
  });
}

describe("whatsapp service", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("sendTextMessage", () => {
    it("sends text message with valid credentials", async () => {
      global.fetch = mockFetchSuccess({
        messages: [{ id: "wamid_abc123" }],
      });

      const result = await sendTextMessage(
        "5511999999999",
        "Hello, world!",
        validCredentials
      );

      expect(result).toEqual({
        success: true,
        messageId: "wamid_abc123",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `${BASE_URL}/${validCredentials.phoneNumberId}/messages`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: `Bearer ${validCredentials.accessToken}`,
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: "5511999999999",
            type: "text",
            text: { body: "Hello, world!" },
          }),
        })
      );
    });

    it("returns error when phoneNumberId is empty", async () => {
      global.fetch = vi.fn();

      const result = await sendTextMessage("5511999999999", "Hello", {
        phoneNumberId: "",
        accessToken: "some_token",
      });

      expect(result).toEqual({
        success: false,
        error: "missing WhatsApp configuration",
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("returns error when accessToken is empty", async () => {
      global.fetch = vi.fn();

      const result = await sendTextMessage("5511999999999", "Hello", {
        phoneNumberId: "123456",
        accessToken: "",
      });

      expect(result).toEqual({
        success: false,
        error: "missing WhatsApp configuration",
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("returns error on HTTP failure", async () => {
      global.fetch = mockFetchError(401, "Unauthorized");

      const result = await sendTextMessage(
        "5511999999999",
        "Hello",
        validCredentials
      );

      expect(result).toEqual({
        success: false,
        error: "HTTP 401",
      });
    });

    it("returns error on network exception", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const result = await sendTextMessage(
        "5511999999999",
        "Hello",
        validCredentials
      );

      expect(result).toEqual({
        success: false,
        error: "Error: Network error",
      });
    });
  });

  describe("sendTemplateMessage", () => {
    it("sends template message with valid credentials", async () => {
      global.fetch = mockFetchSuccess({
        messages: [{ id: "wamid_template_456" }],
      });

      const result = await sendTemplateMessage(
        "5511999999999",
        "appointment_reminder",
        "pt_BR",
        ["Maria", "Dr. Silva"],
        validCredentials
      );

      expect(result).toEqual({
        success: true,
        messageId: "wamid_template_456",
      });

      expect(global.fetch).toHaveBeenCalledWith(
        `${BASE_URL}/${validCredentials.phoneNumberId}/messages`,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: `Bearer ${validCredentials.accessToken}`,
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: "5511999999999",
            type: "template",
            template: {
              name: "appointment_reminder",
              language: { code: "pt_BR" },
              components: [
                {
                  type: "body",
                  parameters: [
                    { type: "text", text: "Maria" },
                    { type: "text", text: "Dr. Silva" },
                  ],
                },
              ],
            },
          }),
        })
      );
    });

    it("returns error when phoneNumberId is empty", async () => {
      global.fetch = vi.fn();

      const result = await sendTemplateMessage(
        "5511999999999",
        "appointment_reminder",
        "pt_BR",
        ["Maria"],
        { phoneNumberId: "", accessToken: "some_token" }
      );

      expect(result).toEqual({
        success: false,
        error: "missing WhatsApp configuration",
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("returns error when accessToken is empty", async () => {
      global.fetch = vi.fn();

      const result = await sendTemplateMessage(
        "5511999999999",
        "appointment_reminder",
        "pt_BR",
        ["Maria"],
        { phoneNumberId: "123456", accessToken: "" }
      );

      expect(result).toEqual({
        success: false,
        error: "missing WhatsApp configuration",
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("returns error on HTTP failure", async () => {
      global.fetch = mockFetchError(403, "Forbidden");

      const result = await sendTemplateMessage(
        "5511999999999",
        "appointment_reminder",
        "pt_BR",
        ["Maria"],
        validCredentials
      );

      expect(result).toEqual({
        success: false,
        error: "HTTP 403",
      });
    });

    it("returns error on network exception", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));

      const result = await sendTemplateMessage(
        "5511999999999",
        "appointment_reminder",
        "pt_BR",
        ["Maria"],
        validCredentials
      );

      expect(result).toEqual({
        success: false,
        error: "Error: Connection refused",
      });
    });
  });
});
