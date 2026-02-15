import type { TurnExpect, CheckResult } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

export function checkTurn(
  expect: TurnExpect,
  toolCallNames: string[],
  responseText: string
): CheckResult {
  const failures: string[] = [];
  const responseLower = responseText.toLowerCase();

  // Check required tools
  if (expect.tools_called) {
    for (const tool of expect.tools_called) {
      if (!toolCallNames.includes(tool)) {
        failures.push(`Expected tool "${tool}" to be called, but it was not. Called: [${toolCallNames.join(", ")}]`);
      }
    }
  }

  // Check forbidden tools
  if (expect.no_tools) {
    for (const tool of expect.no_tools) {
      if (toolCallNames.includes(tool)) {
        failures.push(`Tool "${tool}" was called but should NOT have been`);
      }
    }
  }

  // Check response contains
  if (expect.response_contains) {
    for (const substr of expect.response_contains) {
      if (!responseLower.includes(substr.toLowerCase())) {
        failures.push(`Response missing expected text: "${substr}"`);
      }
    }
  }

  // Check response not contains
  if (expect.response_not_contains) {
    for (const substr of expect.response_not_contains) {
      if (responseLower.includes(substr.toLowerCase())) {
        failures.push(`Response contains forbidden text: "${substr}"`);
      }
    }
  }

  // Check regex match
  if (expect.response_matches) {
    const regex = new RegExp(expect.response_matches);
    if (!regex.test(responseText)) {
      failures.push(`Response does not match pattern: ${expect.response_matches}`);
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

export async function checkAssertions(
  supabase: SupabaseClient,
  assertions: {
    appointment_created?: boolean;
    confirmation_queue_entries?: number;
    conversation_status?: string;
    nps_score_recorded?: boolean;
    invoice_status?: string;
    payment_link_created?: boolean;
  } | undefined,
  clinicId: string,
  patientId: string,
  conversationId: string
): Promise<CheckResult> {
  if (!assertions) return { passed: true, failures: [] };

  const failures: string[] = [];

  if (assertions.appointment_created !== undefined) {
    const { data } = await supabase
      .from("appointments")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId);
    const exists = (data ?? []).length > 0;
    if (exists !== assertions.appointment_created) {
      failures.push(
        `appointment_created: expected ${assertions.appointment_created}, got ${exists}`
      );
    }
  }

  if (assertions.confirmation_queue_entries !== undefined) {
    const { data } = await supabase
      .from("confirmation_queue")
      .select("id")
      .eq("clinic_id", clinicId);
    const count = (data ?? []).length;
    if (count !== assertions.confirmation_queue_entries) {
      failures.push(
        `confirmation_queue_entries: expected ${assertions.confirmation_queue_entries}, got ${count}`
      );
    }
  }

  if (assertions.conversation_status !== undefined) {
    const { data } = await supabase
      .from("conversations")
      .select("status")
      .eq("id", conversationId)
      .single();
    if (data?.status !== assertions.conversation_status) {
      failures.push(
        `conversation_status: expected "${assertions.conversation_status}", got "${data?.status}"`
      );
    }
  }

  if (assertions.nps_score_recorded !== undefined) {
    const { data } = await supabase
      .from("nps_responses")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId);
    const exists = (data ?? []).length > 0;
    if (exists !== assertions.nps_score_recorded) {
      failures.push(
        `nps_score_recorded: expected ${assertions.nps_score_recorded}, got ${exists}`
      );
    }
  }

  if (assertions.invoice_status !== undefined) {
    const { data } = await supabase
      .from("invoices")
      .select("status")
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId);
    const statuses = (data ?? []).map((r: { status: string }) => r.status);
    if (!statuses.includes(assertions.invoice_status)) {
      failures.push(
        `invoice_status: expected "${assertions.invoice_status}", got [${statuses.join(", ")}]`
      );
    }
  }

  if (assertions.payment_link_created !== undefined) {
    const { data } = await supabase
      .from("payment_links")
      .select("id")
      .eq("clinic_id", clinicId);
    const exists = (data ?? []).length > 0;
    if (exists !== assertions.payment_link_created) {
      failures.push(
        `payment_link_created: expected ${assertions.payment_link_created}, got ${exists}`
      );
    }
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}
