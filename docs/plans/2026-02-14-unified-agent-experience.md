# Unified Agent Experience Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove all leaks of the multi-agent architecture so the patient experiences one seamless clinic assistant, never knowing they're being routed between specialized modules.

**Architecture:** Update all agent system prompts, tool results, and tool descriptions to present a single unified identity. Internal routing (responseData, process-message) stays unchanged — only LLM-facing and user-facing strings are updated.

**Tech Stack:** TypeScript, LangChain agent configs

---

## What Changes

| What | Current (Leaks) | Fixed (Unified) |
|------|-----------------|-----------------|
| Agent identity | "Voce e um assistente de agendamento" | Generic clinic assistant (name comes from DB `agents.name`) |
| Tool results | "Conversation routed to the scheduling module" | "Entendido. Vou te ajudar com isso agora." |
| Confirmation reschedule result | mentions scheduling assistant | "Consulta cancelada. Pergunte data/hora" |
| Support prompt | "encaminhe para o modulo de agendamento" | "quando precisar agendar, use route_to_module internamente" |
| Support instructions | "modulos apropriados" | neutral language |

**NOT changed** (internal, patient never sees):
- `responseData.routedTo` — used by process-message.ts engine
- `process-message.ts` routing logic
- `router.ts` classification

---

### Task 1: Update Support Agent — Remove Module Terminology from Prompts

**Files:**
- Modify: `src/lib/agents/agents/basic-support.ts`

**Step 1: Update pt-BR base prompt**

Replace lines mentioning "modulo de agendamento" / "modulo de cobranca":
```
OLD:
- Quando o paciente precisar agendar uma consulta, encaminhe para o modulo de agendamento usando route_to_module.
- Quando o paciente tiver duvidas sobre pagamentos ou cobranças, encaminhe para o modulo de cobranca usando route_to_module.

NEW:
- Quando o paciente precisar agendar, remarcar ou cancelar uma consulta, use a ferramenta route_to_module com o destino apropriado. Nao mencione modulos ou transferencias — apenas continue ajudando naturalmente.
- Quando o paciente tiver duvidas sobre pagamentos ou cobranças, use route_to_module. Nao diga que esta encaminhando ou transferindo.
```

**Step 2: Update en base prompt**

```
OLD:
- When the patient needs to schedule an appointment, route to the scheduling module using route_to_module.
- When the patient has questions about payments or billing, route to the billing module using route_to_module.

NEW:
- When the patient needs to schedule, reschedule, or cancel an appointment, use route_to_module with the appropriate target. Never mention modules or transfers — just continue helping naturally.
- When the patient has questions about payments or billing, use route_to_module. Do not say you are routing or transferring.
```

**Step 3: Update es base prompt**

```
OLD:
- Cuando el paciente necesite agendar una cita, encamina al modulo de agendamiento usando route_to_module.
- Cuando el paciente tenga preguntas sobre pagos o cobros, encamina al modulo de cobranza usando route_to_module.

NEW:
- Cuando el paciente necesite agendar, reprogramar o cancelar una cita, usa route_to_module con el destino apropiado. Nunca menciones modulos o transferencias — simplemente sigue ayudando naturalmente.
- Cuando el paciente tenga preguntas sobre pagos o cobros, usa route_to_module. No digas que estas encaminando o transfiriendo.
```

**Step 4: Update pt-BR instructions**

```
OLD:
"Responda duvidas sobre a clinica usando informacoes verificadas. Encaminhe agendamentos e cobrancas para os modulos apropriados. Escale para humano quando necessario."

NEW:
"Responda duvidas sobre a clinica usando informacoes verificadas. Ajude com agendamentos e cobrancas. Escale para humano quando necessario."
```

**Step 5: Update handleRouteToModule tool result**

```
OLD:
result: `Conversation routed to the ${targetModule} module. Context: ${routeContext}`,

NEW:
result: `Ready to help with: ${routeContext}. Continue the conversation naturally without mentioning any internal routing or module change.`,
```

**Step 6: Run tests**

Run: `npx vitest run src/__tests__/lib/agents/basic-support.test.ts`
Expected: All pass (tool result text changed, update test assertions if needed)

**Step 7: Commit**

```bash
git add src/lib/agents/agents/basic-support.ts
git commit -m "remove module terminology from support agent prompts and tool results"
```

---

### Task 2: Update Confirmation Agent — Remove Multi-Agent Leaks

**Files:**
- Modify: `src/lib/agents/agents/confirmation.ts`

**Step 1: Update pt-BR base prompt identity**

```
OLD:
Voce e um assistente de confirmacao de consultas. Seu papel e lembrar pacientes sobre consultas agendadas e registrar suas respostas.

NEW:
Voce e o assistente virtual da clinica. Neste momento, esta ajudando o paciente a confirmar uma consulta agendada.
```

**Step 2: Update en base prompt identity**

```
OLD:
You are an appointment confirmation assistant. Your role is to remind patients about scheduled appointments and record their responses.

NEW:
You are the clinic's virtual assistant. Right now, you are helping the patient confirm a scheduled appointment.
```

**Step 3: Update es base prompt identity**

```
OLD:
Eres un asistente de confirmacion de citas. Tu rol es recordar a los pacientes sobre citas programadas y registrar sus respuestas.

NEW:
Eres el asistente virtual de la clinica. En este momento, estas ayudando al paciente a confirmar una cita programada.
```

**Step 4: Update reschedule tool result — remove scheduling mention**

```
OLD:
result: `Appointment cancelled successfully. IMPORTANT: Tell the patient their appointment was cancelled and ask "Qual data e horario voce prefere para a nova consulta?" so they can reschedule immediately in this conversation.`,

NEW:
result: `Appointment cancelled successfully. Tell the patient their appointment was cancelled and ask "Qual data e horario voce prefere para a nova consulta?" so they can reschedule right away.`,
```

**Step 5: Run tests**

Run: `npx vitest run src/__tests__/lib/agents/confirmation.test.ts`
Expected: All pass (prompt text changed but test checks for keywords like "confirmacao"/"confirm" — verify)

**Step 6: Commit**

```bash
git add src/lib/agents/agents/confirmation.ts
git commit -m "unify confirmation agent identity as clinic assistant"
```

---

### Task 3: Update Scheduling Agent — Unified Identity

**Files:**
- Modify: `src/lib/agents/agents/scheduling.ts`

**Step 1: Update pt-BR base prompt identity**

```
OLD:
Voce e um assistente de agendamento de consultas. Ajude pacientes a agendar, remarcar ou cancelar consultas.

NEW:
Voce e o assistente virtual da clinica. Neste momento, esta ajudando o paciente com agendamento de consultas.
```

**Step 2: Update en base prompt identity**

```
OLD:
You are an appointment scheduling assistant. Help patients book, reschedule, or cancel appointments.

NEW:
You are the clinic's virtual assistant. Right now, you are helping the patient with appointment scheduling.
```

**Step 3: Update es base prompt identity**

```
OLD:
Eres un asistente de agendamiento de citas. Ayuda a los pacientes a agendar, reprogramar o cancelar citas.

NEW:
Eres el asistente virtual de la clinica. En este momento, estas ayudando al paciente con el agendamiento de citas.
```

**Step 4: Run tests**

Run: `npx vitest run src/__tests__/lib/agents/scheduling.test.ts`
Expected: All pass

**Step 5: Commit**

```bash
git add src/lib/agents/agents/scheduling.ts
git commit -m "unify scheduling agent identity as clinic assistant"
```

---

### Task 4: Update NPS Agent — Unified Identity

**Files:**
- Modify: `src/lib/agents/agents/nps.ts`

**Step 1: Update pt-BR base prompt identity**

```
OLD:
Voce e um assistente de pesquisa de satisfacao (NPS).

NEW:
Voce e o assistente virtual da clinica. Neste momento, esta conduzindo uma breve pesquisa de satisfacao com o paciente.
```

**Step 2: Update en base prompt identity**

```
OLD:
You are a satisfaction survey (NPS) assistant.

NEW:
You are the clinic's virtual assistant. Right now, you are conducting a brief satisfaction survey with the patient.
```

**Step 3: Update es base prompt identity**

```
OLD:
Eres un asistente de encuesta de satisfaccion (NPS).

NEW:
Eres el asistente virtual de la clinica. En este momento, estas conduciendo una breve encuesta de satisfaccion con el paciente.
```

**Step 4: Run tests**

Run: `npx vitest run src/__tests__/lib/agents/nps.test.ts`
Expected: All pass (tests check for "satisfacao"/"NPS"/"satisfaccion" — may need assertion updates)

**Step 5: Commit**

```bash
git add src/lib/agents/agents/nps.ts
git commit -m "unify NPS agent identity as clinic assistant"
```

---

### Task 5: Fix Tests If Assertions Break

**Files:**
- Modify: `src/__tests__/lib/agents/confirmation.test.ts` (if needed)
- Modify: `src/__tests__/lib/agents/nps.test.ts` (if needed)
- Modify: `src/__tests__/lib/agents/basic-support.test.ts` (if needed)

**Step 1: Run full test suite**

Run: `npx vitest run`

**Step 2: Fix any assertion that checks for old identity strings**

For example, confirmation test checks for `"confirmacao" || "consulta"` in the prompt — "consulta" still appears so it should pass. NPS test checks for `"NPS" || "satisfacao"` — "satisfacao" still appears in the new prompt.

**Step 3: Commit fixes**

```bash
git add src/__tests__/
git commit -m "update test assertions for unified agent identity"
```

---

### Task 6: Run Full Suite + Deploy

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: 139 tests pass

**Step 2: Push to deploy**

```bash
git push
```

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `src/lib/agents/agents/basic-support.ts` | Remove "modulo" from prompts, neutral tool result |
| `src/lib/agents/agents/confirmation.ts` | "assistente virtual da clinica" identity, clean tool result |
| `src/lib/agents/agents/scheduling.ts` | "assistente virtual da clinica" identity |
| `src/lib/agents/agents/nps.ts` | "assistente virtual da clinica" identity |
| Tests (if needed) | Update prompt keyword assertions |
