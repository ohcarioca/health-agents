# Landing Page — Órbita Design Doc

**Date:** 2026-02-19
**Branch:** features/landing-page
**Status:** Approved

---

## Overview

A commercial landing page for Órbita — an AI-powered autonomous agent platform for Brazilian healthcare clinics. The page lives at `/` (root) and is the primary conversion surface for new clinic signups.

**Primary goal:** Convert clinic owners/managers into 14-day free trial signups.
**Approach:** Product-led narrative — long-scroll page that educates before converting.

---

## Visual Identity

| Token | Value |
|-------|-------|
| Display font | `Instrument Serif` (headlines) |
| Body font | `DM Sans` (body, UI) |
| Primary accent | `#0EA5E9` (sky blue — matches app) |
| Text dark | `#0F172A` (slate-950) |
| Background primary | `#FFFFFF` |
| Background alternate | `#F8FAFC` (slate-50) |
| Border | `#E2E8F0` (slate-200) |

Aesthetic: Minimalist & elegant. Heavy whitespace, strong type hierarchy, editorial feel. Inspired by Linear.app and Apple — adapted for Brazilian healthcare market.

---

## Page Architecture

### Route

`src/app/[locale]/(marketing)/page.tsx` — Server Component, uses next-intl for i18n.
Translations: `messages/pt-BR.json` under `landing.*` namespace.

### Components

All live in `src/components/landing/`:

| File | Responsibility |
|------|---------------|
| `navbar.tsx` | Navigation — logo, links, CTA buttons |
| `hero.tsx` | Hero section with headline, sub, CTAs, WhatsApp mockup |
| `problem-bar.tsx` | 3 market-stat chips |
| `agents-overview.tsx` | 6-agent grid |
| `how-it-works.tsx` | 3-step explainer |
| `feature-deep-dives.tsx` | 4 alternating feature blocks |
| `dashboard-preview.tsx` | Dashboard mockup section |
| `differentiators.tsx` | 4 differentiator cards |
| `pricing.tsx` | 3-plan pricing cards |
| `faq.tsx` | Accordion FAQ |
| `final-cta.tsx` | Closing CTA section |
| `footer.tsx` | Site footer |
| `whatsapp-mockup.tsx` | Reusable WhatsApp chat UI component |

---

## Section Specifications

### 1. Navbar
- Logo: "Órbita" wordmark (SVG, sky blue)
- Nav links: "Funcionalidades" · "Preços" · "Como funciona" (smooth-scroll anchors)
- Right: "Entrar" (ghost button → `/login`) + "Começar grátis" (blue solid → `/signup`)
- Sticky on scroll, minimal shadow on scroll

### 2. Hero
**Headline (display font, ~80px):**
> "Sua clínica atende.
> A Órbita cuida do resto."

**Subtext:** "6 agentes autônomos que agendam, confirmam, cobram e reativam pacientes — tudo pelo WhatsApp. Sem app. Sem treinamento."

**CTAs:**
- Primary: "Começar 14 dias grátis →" → `/signup`
- Secondary: "Ver como funciona" (scroll to how-it-works section)

**Visual:** Floating WhatsApp chat mockup (right side) showing patient booking interaction. Subtle entrance animation on load.

**Background:** Off-white gradient mesh, subtle geometric pattern.

### 3. Problem Bar
3 horizontal chips with market benchmarks:
- `22%` — "das consultas são perdidas por não-comparecimento"
- `R$15 bi/ano` — "em receita não realizada no Brasil"
- `3h/dia` — "gastos por recepcionistas em follow-up manual"

Source note: "Estimativas baseadas em dados do CFM e ABIMO."

### 4. Agents Overview
**Section headline:** "Uma equipe de IA que nunca dorme"

Grid 2×3, each card:
- Icon (line icon)
- Agent name
- 1-sentence description

| Agent | Description |
|-------|-------------|
| Agendamento | Pacientes marcam, cancelam e remarcam sozinhos, 24h |
| Confirmação | Lembretes automáticos 48h, 24h e 2h antes da consulta |
| Cobrança | Cobranças gentis com link Pix gerado automaticamente |
| NPS | Pesquisa de satisfação após cada atendimento |
| Recall | Reativa pacientes que sumiram há 90+ dias |
| Suporte | Tira dúvidas, passa informações e escala para humano |

### 5. How It Works
**Section headline:** "Pronto em 15 minutos"

3 numbered steps (horizontal on desktop, vertical on mobile):
1. **Conecte seu WhatsApp Business** — "Integre em poucos cliques com a API oficial do Meta."
2. **Configure sua clínica** — "Horários, serviços, profissionais. A Órbita aprende sobre você."
3. **Agentes em ação** — "A partir daí, seus pacientes são atendidos automaticamente."

### 6. Feature Deep-Dives
4 alternating blocks (text left/right, mockup opposite):

**Block 1 — Agendamento**
- Headline: "Sua agenda cheia. Automaticamente."
- Copy: Pacientes agendam pelo WhatsApp sem ligar para a clínica. A Órbita verifica disponibilidade em tempo real e confirma na hora.
- Visual: WhatsApp mockup — patient booking flow

**Block 2 — Confirmação**
- Headline: "Zero falta. Zero surpresa."
- Copy: Lembretes automáticos em 3 momentos críticos. Paciente confirma ou reagenda com um toque.
- Visual: Timeline visual showing 48h/24h/2h reminders

**Block 3 — Cobrança**
- Headline: "Receba mais. Cobre menos."
- Copy: O agente de cobrança envia lembretes e gera links de pagamento Pix, boleto ou cartão automaticamente.
- Visual: WhatsApp mockup — payment link message

**Block 4 — Recall**
- Headline: "Seus pacientes não somem. Eles voltam."
- Copy: A Órbita identifica pacientes inativos há 90+ dias e envia uma mensagem personalizada de reativação.
- Visual: WhatsApp mockup — reactivation message

### 7. Dashboard Preview
**Headline:** "Tudo sob controle. Em tempo real."
**Subtext:** "Acompanhe agendamentos, taxas de confirmação, NPS e receita — tudo em um painel limpo e direto."

Visual: Dashboard screenshot or illustrated mockup showing KPI cards (consultas hoje, NPS médio, taxa de confirmação, receita).

### 8. Differentiators
4 cards with icon + headline + 2-line copy:

1. **Sem app para o paciente** — "Funciona pelo WhatsApp que o paciente já usa. Zero fricção."
2. **Setup em 15 minutos** — "Nenhuma integração complexa. Sem engenharia necessária."
3. **Qualquer especialidade** — "Odontologia, medicina, estética, fisioterapia, psicologia e muito mais."
4. **Controle total** — "Inbox de escalada humana para casos que precisam de atenção pessoal."

### 9. Pricing
3 plan cards. Recommended badge on middle card.

| Plan | Description | CTA |
|------|-------------|-----|
| **Início** | 1 profissional, todos os agentes | "Começar grátis" |
| **Clínica** ⭐ | Até 5 profissionais, dashboard completo | "Começar grátis" |
| **Consultório** | Ilimitado, suporte dedicado, relatórios avançados | "Falar com vendas" |

Fine print: "14 dias grátis. Sem cartão de crédito. Cancele a qualquer momento."

### 10. FAQ
5 accordion items:
1. Preciso de WhatsApp Business API paga?
2. Funciona para qualquer especialidade médica?
3. Como funciona o período de trial?
4. Posso personalizar as mensagens dos agentes?
5. O que acontece se o paciente tiver uma dúvida complexa?

### 11. Final CTA
Full-width section with large centered copy:
> "Pronto para transformar sua clínica?"

Sub: "Junte-se às clínicas que estão automatizando o relacionamento com pacientes."

CTA button: "Começar 14 dias grátis →"

### 12. Footer
- Logo + tagline: "Plataforma de agentes autônomos para saúde"
- Links: Funcionalidades · Preços · Blog · Documentação · Termos · Privacidade
- Social icons: Instagram · LinkedIn
- Copyright: "© 2026 Órbita. Feito para clínicas brasileiras."

---

## Technical Implementation

### Route Structure
```
src/app/[locale]/(marketing)/
  page.tsx          ← landing page (Server Component)
  layout.tsx        ← marketing layout (no sidebar)
```

### Internationalization
- Translations added to `messages/pt-BR.json` under `landing.*` namespace
- Server Component uses `getTranslations('landing')` from next-intl

### Styling
- Tailwind CSS v4 utilities only
- New CSS variables added to `globals.css` for landing-specific tokens (display font)
- No `tailwind.config.*`, no CSS modules
- Google Fonts: `Instrument Serif` + `DM Sans` via `next/font/google`

### Performance
- All sections are Server Components except FAQ accordion (needs `"use client"` for open/close state)
- Images use `next/image` with proper sizing
- No JS-heavy animations — CSS transitions only

---

## Out of Scope (this sprint)

- Blog section
- Case studies / testimonials (real clients TBD)
- Video demo embed
- Multi-language toggle (pt-BR only for now)
- A/B testing
