import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScenarioGuardrails, ScenarioExpectations, CheckResult } from "./types";

/** Per-turn guardrail check during conversation */
export function checkGuardrails(
  guardrails: ScenarioGuardrails | undefined,
  toolCallNames: string[],
  responseText: string
): CheckResult {
  if (!guardrails) return { passed: true, failures: [] };

  const failures: string[] = [];
  const responseLower = responseText.toLowerCase();

  if (guardrails.never_tools) {
    for (const tool of guardrails.never_tools) {
      if (toolCallNames.includes(tool)) {
        failures.push(`Guardrail violated: forbidden tool "${tool}" was called`);
      }
    }
  }

  if (guardrails.never_contains) {
    for (const substr of guardrails.never_contains) {
      if (responseLower.includes(substr.toLowerCase())) {
        failures.push(`Guardrail violated: response contains forbidden text "${substr}"`);
      }
    }
  }

  if (guardrails.never_matches) {
    const regex = new RegExp(guardrails.never_matches, "i");
    if (regex.test(responseText)) {
      failures.push(`Guardrail violated: response matches forbidden pattern "${guardrails.never_matches}"`);
    }
  }

  return { passed: failures.length === 0, failures };
}

/** Post-conversation tool expectations check */
export function checkToolExpectations(
  expectations: ScenarioExpectations,
  allToolsCalled: string[],
  allResponses: string[]
): CheckResult {
  const failures: string[] = [];

  if (expectations.tools_called) {
    for (const tool of expectations.tools_called) {
      if (!allToolsCalled.includes(tool)) {
        failures.push(`Expected tool "${tool}" to be called during conversation, but it was not. Called: [${allToolsCalled.join(", ")}]`);
      }
    }
  }

  if (expectations.tools_not_called) {
    for (const tool of expectations.tools_not_called) {
      if (allToolsCalled.includes(tool)) {
        failures.push(`Tool "${tool}" was called but should NOT have been`);
      }
    }
  }

  if (expectations.response_contains) {
    const allResponsesLower = allResponses.map((r) => r.toLowerCase()).join(" ");
    for (const substr of expectations.response_contains) {
      if (!allResponsesLower.includes(substr.toLowerCase())) {
        failures.push(`No agent response contained expected text: "${substr}"`);
      }
    }
  }

  return { passed: failures.length === 0, failures };
}

/** Post-conversation DB assertions */
export async function checkAssertions(
  supabase: SupabaseClient,
  assertions: ScenarioExpectations["assertions"],
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

  return { passed: failures.length === 0, failures };
}
