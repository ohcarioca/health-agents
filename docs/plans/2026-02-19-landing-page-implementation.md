# Landing Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a production-grade commercial landing page for Órbita at `/` — product-led narrative, minimalist/elegant design, 14-day free trial CTA.

**Architecture:** New `(marketing)` route group at `src/app/(marketing)/` with its own layout. Dashboard home moves from `/` → `/dashboard`. `proxy.ts` updated to make `/` public. All UI in `src/components/landing/`. Server Components throughout except FAQ accordion.

**Tech Stack:** Next.js App Router, React 19, TypeScript strict, Tailwind CSS v4, next-intl (`getTranslations`), next/font/google (`Instrument_Serif` + `DM_Sans`), Lucide icons.

---

## PHASE 1 — Routing & Foundation

### Task 1: Update proxy.ts — make `/` public, update post-auth redirect

**Files:**
- Modify: `src/proxy.ts`

**Context:**
Currently the proxy redirects ALL unauthenticated requests (including `/`) to `/login`.
We need `/` to be publicly accessible (landing page). We also change the post-auth redirect
from `/` to `/dashboard` since the dashboard moves there.

Public routes list needs to include `/`. The matcher already excludes `/api` and `/c/`.

**Step 1: Replace the proxy.ts file**

```ts
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Routes accessible without authentication
const PUBLIC_ROUTES = ["/", "/login", "/signup", "/auth/callback"];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) =>
    route === "/" ? pathname === "/" : pathname.startsWith(route)
  );
}

// Routes that authenticated users are redirected away from
const AUTH_ROUTES = ["/login", "/signup", "/auth/callback"];

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((route) => pathname.startsWith(route));
}

export async function proxy(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    throw new Error(
      "missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  }

  const response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Unauthenticated user trying to access protected route → redirect to login
  if (!user && !isPublicRoute(pathname)) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user on login/signup → redirect to dashboard
  if (user && isAuthRoute(pathname)) {
    const dashboardUrl = new URL("/dashboard", request.url);
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api|c/|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
```

**Step 2: Verify it compiles**

```bash
cd "c:/Users/KABUM/Documents/BALAM SANDBOX/supermvp/health-agents/.worktrees/features-landing-page"
npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

Expected: No errors related to proxy.ts

**Step 3: Commit**

```bash
git add src/proxy.ts
git commit -m "feat(routing): make / public, move post-auth redirect to /dashboard"
```

---

### Task 2: Move dashboard home from `/` to `/dashboard`

**Files:**
- Create: `src/app/(dashboard)/dashboard/page.tsx` (copy of existing `(dashboard)/page.tsx`)
- Delete: `src/app/(dashboard)/page.tsx`

**Context:**
Currently `(dashboard)/page.tsx` maps to URL `/`. Since landing page takes `/`, the dashboard
home needs to move to `/dashboard`. The `(dashboard)` route group layout already handles auth.

**Step 1: Create the new dashboard page at /dashboard**

Create `src/app/(dashboard)/dashboard/page.tsx` with the EXACT same content as the current
`src/app/(dashboard)/page.tsx`. Copy it verbatim — no changes.

**Step 2: Delete the old page**

```bash
rm "c:/Users/KABUM/Documents/BALAM SANDBOX/supermvp/health-agents/.worktrees/features-landing-page/src/app/(dashboard)/page.tsx"
```

**Step 3: Update sidebar nav link to /dashboard**

Find the sidebar navigation component that links to the dashboard home and update it:

```bash
grep -r "href.*\"\/\"" src/components/layout/ --include="*.tsx"
```

If found, update any `href="/"` to `href="/dashboard"` in sidebar/nav components.

**Step 4: Verify TypeScript**

```bash
npx tsc --noEmit 2>&1 | head -30
```

**Step 5: Commit**

```bash
git add src/app/
git commit -m "feat(routing): move dashboard home to /dashboard"
```

---

### Task 3: Create `(marketing)` route group layout

**Files:**
- Create: `src/app/(marketing)/layout.tsx`

**Context:**
The marketing layout is minimal — no sidebar, no topbar, no auth. Just fonts and the `.landing`
CSS class on the wrapper so CSS variables are overridden to light mode.

**Step 1: Create the marketing layout**

```tsx
// src/app/(marketing)/layout.tsx
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="landing">{children}</div>;
}
```

**Step 2: Commit**

```bash
git add src/app/\(marketing\)/layout.tsx
git commit -m "feat(landing): add marketing route group layout"
```

---

### Task 4: Add fonts + landing CSS variables to globals.css and root layout

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

**Context:**
We add `Instrument_Serif` (display/headlines) and `DM_Sans` (body for landing page) via
`next/font/google`. Both get CSS variables. We also add:
1. `--font-display` and `--font-landing` to `@theme inline`
2. `.landing` class with light-mode CSS variables + landing-specific tokens
3. CSS keyframe animations for landing entrance effects

**Step 1: Update root layout.tsx to load both fonts**

```tsx
// src/app/layout.tsx
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Instrument_Serif, DM_Sans } from "next/font/google";
import { ThemeProvider } from "@/contexts/theme-provider";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Órbita",
  description: "Plataforma de agentes autônomos para saúde",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${GeistSans.variable} ${GeistMono.variable} ${instrumentSerif.variable} ${dmSans.variable}`}
    >
      <body className="antialiased">
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

**Step 2: Add font variables + landing CSS to globals.css**

Append after the existing `@theme inline` block (replace the current `@theme inline` block):

```css
@theme inline {
  --font-sans: "Geist Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "Geist Mono", ui-monospace, monospace;
  --font-display: var(--font-instrument-serif), Georgia, "Times New Roman", serif;
  --font-landing: var(--font-dm-sans), var(--font-sans);
}
```

Then add the `.landing` section and keyframes at the END of globals.css:

```css
/* ─── Landing page — always light, own design tokens ─── */
.landing {
  /* Force light-mode surface */
  --background: #ffffff;
  --surface: #f8fafc;
  --surface-elevated: #ffffff;
  --border: #e2e8f0;
  --border-strong: #cbd5e1;
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-muted: #94a3b8;

  /* Landing accent — brand purple */
  --lp-accent: #7c3aed;
  --lp-accent-light: #ede9fe;
  --lp-accent-fg: #ffffff;

  /* Landing typography scale */
  --lp-hero-size: clamp(2.75rem, 6vw, 5rem);
  --lp-section-title-size: clamp(1.75rem, 3.5vw, 2.75rem);

  background-color: #ffffff;
  color: #0f172a;
  font-family: var(--font-landing);
}

/* Entrance animation for landing elements */
@keyframes lp-fade-up {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes lp-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes lp-float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-8px); }
}

@keyframes lp-typing {
  0%, 60%, 100% { opacity: 0.3; }
  30% { opacity: 1; }
}

.lp-animate-fade-up {
  animation: lp-fade-up 0.6s ease both;
}

.lp-animate-float {
  animation: lp-float 4s ease-in-out infinite;
}
```

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: No errors

**Step 4: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css
git commit -m "feat(landing): add Instrument Serif + DM Sans fonts, landing CSS tokens"
```

---

### Task 5: Add landing translations to `messages/pt-BR.json`

**Files:**
- Modify: `messages/pt-BR.json`

**Context:**
Add a `"landing"` namespace with all user-facing strings for the landing page.
Read the existing file first, then append the `"landing"` key.

**Step 1: Append to messages/pt-BR.json**

Open the file and add `"landing": { ... }` as the last key before the closing `}`.
Use this exact content:

```json
"landing": {
  "nav": {
    "features": "Funcionalidades",
    "pricing": "Preços",
    "howItWorks": "Como funciona",
    "signIn": "Entrar",
    "startFree": "Começar grátis"
  },
  "hero": {
    "headline1": "Sua clínica atende.",
    "headline2": "A Órbita cuida do resto.",
    "sub": "6 agentes autônomos que agendam, confirmam, cobram e reativam pacientes — tudo pelo WhatsApp. Sem app. Sem treinamento.",
    "ctaPrimary": "Começar 14 dias grátis",
    "ctaSecondary": "Ver como funciona",
    "trustedBy": "Tecnologia pensada para clínicas brasileiras"
  },
  "problem": {
    "stat1Value": "22%",
    "stat1Label": "das consultas perdidas por não-comparecimento",
    "stat2Value": "R$15 bi",
    "stat2Label": "em receita não realizada por ano no Brasil",
    "stat3Value": "3h/dia",
    "stat3Label": "gastos em follow-up manual por recepcionistas"
  },
  "agents": {
    "title": "Uma equipe de IA que nunca dorme",
    "sub": "6 agentes especializados, cada um com uma missão clara — todos trabalhando pelo WhatsApp que seus pacientes já usam.",
    "scheduling": {
      "name": "Agendamento",
      "desc": "Pacientes marcam, cancelam e remarcam 24h por dia, sem ligar para a clínica."
    },
    "confirmation": {
      "name": "Confirmação",
      "desc": "Lembretes automáticos em 3 momentos: 48h, 24h e 2h antes da consulta."
    },
    "billing": {
      "name": "Cobrança",
      "desc": "Cobranças gentis com link Pix gerado automaticamente. Sem constrangimento."
    },
    "nps": {
      "name": "NPS",
      "desc": "Pesquisa de satisfação após cada atendimento. Redireciona promotores para o Google."
    },
    "recall": {
      "name": "Recall",
      "desc": "Reativa pacientes que sumiram há 90+ dias com mensagens personalizadas."
    },
    "support": {
      "name": "Suporte",
      "desc": "Tira dúvidas, informa convênios aceitos e escala para humano quando necessário."
    }
  },
  "howItWorks": {
    "title": "Pronto em 15 minutos",
    "sub": "Nenhuma integração complexa. Sem engenharia.",
    "step1Title": "Conecte seu WhatsApp",
    "step1Desc": "Integre com a API oficial do Meta em poucos cliques. Sem bot não-oficial.",
    "step2Title": "Configure sua clínica",
    "step2Desc": "Horários, serviços, profissionais. A Órbita aprende sobre o seu negócio.",
    "step3Title": "Agentes em ação",
    "step3Desc": "A partir daí, seus pacientes são atendidos automaticamente — 24h, 7 dias."
  },
  "features": {
    "scheduling": {
      "tag": "Agendamento",
      "title": "Sua agenda cheia. Automaticamente.",
      "desc": "Pacientes agendam pelo WhatsApp sem precisar ligar para a recepção. A Órbita verifica disponibilidade em tempo real e confirma na hora — de madrugada, nos fins de semana, sem parar.",
      "bullets": ["Consulta, cancelamento e remarcação self-service", "Verificação de disponibilidade em tempo real", "Confirmação imediata por WhatsApp"]
    },
    "confirmation": {
      "tag": "Confirmação",
      "title": "Zero falta. Zero surpresa.",
      "desc": "Lembretes automáticos nos 3 momentos mais críticos. O paciente confirma ou reagenda com um toque — e sua agenda se ajusta automaticamente.",
      "bullets": ["Lembrete 48h antes: reduz faltas em até 70%", "Lembrete 24h: janela para remarcação", "Lembrete 2h: confirmação final"]
    },
    "billing": {
      "tag": "Cobrança",
      "title": "Receba mais. Cobre menos.",
      "desc": "O agente de cobrança envia lembretes gentis e gera links de pagamento Pix, boleto ou cartão automaticamente. Sem constrangimento, sem recepcionista no meio.",
      "bullets": ["Links de Pix gerados automaticamente via Asaas", "Lembretes de cobrança em sequência inteligente", "Paciente escolhe o método de pagamento"]
    },
    "recall": {
      "tag": "Recall",
      "title": "Seus pacientes não somem. Eles voltam.",
      "desc": "A Órbita identifica pacientes inativos há 90+ dias e envia uma mensagem personalizada de reativação. Receita nova sem precisar de novos pacientes.",
      "bullets": ["Identifica automaticamente pacientes inativos", "Mensagem personalizada com nome e histórico", "Rota diretamente para o agendamento"]
    }
  },
  "dashboard": {
    "title": "Tudo sob controle. Em tempo real.",
    "desc": "Acompanhe agendamentos, taxas de confirmação, NPS e receita — tudo em um painel limpo e direto ao ponto."
  },
  "differentiators": {
    "title": "Por que a Órbita?",
    "d1Title": "Sem app para o paciente",
    "d1Desc": "Funciona pelo WhatsApp que o paciente já usa. Zero atrito, zero instalação.",
    "d2Title": "Setup em 15 minutos",
    "d2Desc": "Sem integração complexa. Sem equipe de TI. Pronto para atender no mesmo dia.",
    "d3Title": "Qualquer especialidade",
    "d3Desc": "Odontologia, medicina, estética, fisioterapia, psicologia, veterinária e muito mais.",
    "d4Title": "Controle total",
    "d4Desc": "Inbox de escalada humana para os casos que merecem atenção pessoal."
  },
  "pricing": {
    "title": "Simples. Transparente. Sem pegadinhas.",
    "sub": "14 dias grátis em todos os planos. Sem cartão de crédito.",
    "monthly": "por mês",
    "recommended": "Mais popular",
    "ctaStart": "Começar grátis",
    "ctaContact": "Falar com vendas",
    "plan1Name": "Início",
    "plan1Price": "R$197",
    "plan1Desc": "Para clínicas com 1 profissional começando a automatizar.",
    "plan1Features": ["1 profissional", "Todos os 6 agentes", "Dashboard completo", "Suporte por e-mail"],
    "plan2Name": "Clínica",
    "plan2Price": "R$397",
    "plan2Desc": "Para clínicas em crescimento que querem mais controle.",
    "plan2Features": ["Até 5 profissionais", "Todos os 6 agentes", "Dashboard + Relatórios", "Página pública da clínica", "Suporte prioritário"],
    "plan3Name": "Consultório",
    "plan3Price": "R$797",
    "plan3Desc": "Para clínicas maiores com necessidades avançadas.",
    "plan3Features": ["Profissionais ilimitados", "Todos os 6 agentes", "Relatórios avançados (PDF)", "Integrações Google Calendar", "Suporte dedicado + onboarding"]
  },
  "faq": {
    "title": "Dúvidas frequentes",
    "q1": "Preciso de uma conta WhatsApp Business API paga?",
    "a1": "A Órbita usa a API oficial do Meta WhatsApp Business. Para volumes pequenos (até ~1.000 mensagens/mês), o Meta oferece um nível gratuito. Para volumes maiores, o custo é de centavos por conversa. Nós orientamos todo o processo de configuração.",
    "q2": "Funciona para qualquer especialidade médica?",
    "a2": "Sim. A Órbita foi desenhada para qualquer tipo de clínica de saúde: odontologia, medicina geral e especialidades, estética, fisioterapia, psicologia, fonoaudiologia, nutrição, veterinária, entre outras.",
    "q3": "Como funciona o período de teste de 14 dias?",
    "a3": "Você cria sua conta, configura sua clínica e conecta seu WhatsApp Business sem precisar de cartão de crédito. Durante 14 dias, você tem acesso completo a todos os recursos. Ao final, escolhe o plano que melhor se encaixa.",
    "q4": "Posso personalizar as mensagens dos agentes?",
    "a4": "Sim. Cada agente tem nome, descrição e instruções personalizáveis. Você define o tom (formal, amigável), o nome do agente e pode adicionar instruções específicas para o comportamento dele.",
    "q5": "O que acontece se o paciente tiver uma dúvida muito complexa?",
    "a5": "O agente de suporte reconhece quando uma dúvida está fora do seu escopo e escala automaticamente para um humano. Você recebe a notificação na Caixa de Entrada da Órbita e assume a conversa com todo o histórico disponível."
  },
  "finalCta": {
    "title": "Pronto para transformar sua clínica?",
    "sub": "Junte-se às clínicas que estão automatizando o relacionamento com pacientes.",
    "cta": "Começar 14 dias grátis",
    "noCc": "Sem cartão de crédito. Cancele a qualquer momento."
  },
  "footer": {
    "tagline": "Plataforma de agentes autônomos para saúde.",
    "product": "Produto",
    "company": "Empresa",
    "legal": "Legal",
    "features": "Funcionalidades",
    "pricing": "Preços",
    "docs": "Documentação",
    "about": "Sobre nós",
    "blog": "Blog",
    "contact": "Contato",
    "terms": "Termos de Uso",
    "privacy": "Privacidade",
    "rights": "Todos os direitos reservados."
  }
}
```

**Step 2: Verify JSON is valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('messages/pt-BR.json','utf8')); console.log('valid');"
```

Expected: `valid`

**Step 3: Commit**

```bash
git add messages/pt-BR.json
git commit -m "feat(landing): add landing page translations to pt-BR"
```

---

## PHASE 2 — UI Components

### Task 6: Create WhatsApp mockup component

**Files:**
- Create: `src/components/landing/whatsapp-mockup.tsx`

**Context:**
Reusable component that renders a styled WhatsApp chat interface. Used in Hero
and Feature Deep-Dives. Pure UI, no data, Server Component.

**Step 1: Create the component**

```tsx
// src/components/landing/whatsapp-mockup.tsx

interface WhatsAppMessage {
  text: string;
  type: "incoming" | "outgoing";
  time?: string;
}

interface WhatsAppMockupProps {
  contactName: string;
  contactEmoji?: string;
  messages: WhatsAppMessage[];
  className?: string;
}

export function WhatsAppMockup({
  contactName,
  contactEmoji = "🏥",
  messages,
  className = "",
}: WhatsAppMockupProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl shadow-2xl ${className}`}
      style={{ maxWidth: 320, fontFamily: "var(--font-landing)" }}
    >
      {/* Phone notch + status bar */}
      <div
        className="relative flex flex-col"
        style={{ backgroundColor: "#075e54", borderRadius: "24px 24px 0 0" }}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <span className="text-xs font-medium text-white/80">9:41</span>
          <div className="flex items-center gap-1">
            <div className="flex gap-0.5">
              {[3, 2.5, 2, 1.5].map((h, i) => (
                <div
                  key={i}
                  className="w-0.5 rounded-full bg-white/80"
                  style={{ height: `${h * 3}px` }}
                />
              ))}
            </div>
            <svg className="size-3 text-white/80" fill="currentColor" viewBox="0 0 24 24">
              <path d="M1.5 8.5a13 13 0 0 1 21 0M5.5 12.5a8 8 0 0 1 13 0M9 16.5a4 4 0 0 1 6 0M12 20h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
            </svg>
            <svg className="size-3 text-white/80" fill="currentColor" viewBox="0 0 24 24">
              <rect x="2" y="7" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" fill="none"/>
              <path d="M16 11l4-2v6l-4-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
            </svg>
          </div>
        </div>

        {/* Contact header */}
        <div className="flex items-center gap-3 px-4 py-2 pb-3">
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-lg"
            style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
          >
            {contactEmoji}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{contactName}</p>
            <p className="text-xs text-white/60">online</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex flex-col gap-2 p-3"
        style={{
          backgroundColor: "#ece5dd",
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23c5b9a8' fill-opacity='0.15'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
          minHeight: 200,
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.type === "outgoing" ? "justify-end" : "justify-start"}`}
            style={{
              animation: `lp-fade-up 0.4s ease both`,
              animationDelay: `${i * 0.15 + 0.3}s`,
            }}
          >
            <div
              className="relative max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed shadow-sm"
              style={{
                backgroundColor:
                  msg.type === "outgoing" ? "#dcf8c6" : "#ffffff",
                borderRadius:
                  msg.type === "outgoing"
                    ? "12px 2px 12px 12px"
                    : "2px 12px 12px 12px",
                color: "#111",
              }}
            >
              {msg.text}
              <span
                className="ml-2 inline-block text-[10px]"
                style={{ color: "#999", verticalAlign: "bottom" }}
              >
                {msg.time ?? "09:41"}
                {msg.type === "outgoing" && (
                  <span className="ml-0.5" style={{ color: "#53bdeb" }}>✓✓</span>
                )}
              </span>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        <div className="flex justify-start">
          <div
            className="flex items-center gap-1 rounded-xl px-3 py-2.5 shadow-sm"
            style={{ backgroundColor: "#ffffff", borderRadius: "2px 12px 12px 12px" }}
          >
            {[0, 0.2, 0.4].map((delay, i) => (
              <div
                key={i}
                className="size-1.5 rounded-full"
                style={{
                  backgroundColor: "#999",
                  animation: `lp-typing 1.2s ease-in-out infinite`,
                  animationDelay: `${delay}s`,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Input bar */}
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ backgroundColor: "#f0f0f0", borderRadius: "0 0 24px 24px" }}
      >
        <div
          className="flex flex-1 items-center rounded-full bg-white px-3 py-1.5"
        >
          <span className="text-xs text-gray-400">Digite uma mensagem</span>
        </div>
        <div
          className="flex size-8 items-center justify-center rounded-full"
          style={{ backgroundColor: "#075e54" }}
        >
          <svg className="size-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/landing/whatsapp-mockup.tsx
git commit -m "feat(landing): add WhatsApp mockup component"
```

---

### Task 7: Create Navbar

**Files:**
- Create: `src/components/landing/navbar.tsx`

**Context:**
Server Component. Fixed on scroll. Logo left, nav links center, CTA right.
Uses smooth-scroll anchors for in-page navigation.

**Step 1: Create the navbar**

```tsx
// src/components/landing/navbar.tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function LandingNavbar() {
  const t = await getTranslations("landing.nav");

  return (
    <header
      className="sticky top-0 z-50 w-full"
      style={{
        backgroundColor: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid #e2e8f0",
      }}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 no-underline">
          <div
            className="flex size-8 items-center justify-center rounded-lg text-white text-sm font-bold"
            style={{ backgroundColor: "var(--lp-accent)" }}
          >
            O
          </div>
          <span
            className="text-lg font-semibold tracking-tight"
            style={{ color: "#0f172a", fontFamily: "var(--font-landing)" }}
          >
            Órbita
          </span>
        </Link>

        {/* Nav links — hidden on mobile */}
        <div className="hidden items-center gap-8 md:flex">
          {[
            { href: "#agents", label: t("features") },
            { href: "#how-it-works", label: t("howItWorks") },
            { href: "#pricing", label: t("pricing") },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium transition-colors hover:opacity-70"
              style={{ color: "#475569", textDecoration: "none" }}
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* CTA */}
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden text-sm font-medium transition-colors hover:opacity-70 sm:block"
            style={{ color: "#475569", textDecoration: "none" }}
          >
            {t("signIn")}
          </Link>
          <Link
            href="/signup"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "var(--lp-accent)" }}
          >
            {t("startFree")}
          </Link>
        </div>
      </nav>
    </header>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/landing/navbar.tsx
git commit -m "feat(landing): add landing navbar"
```

---

### Task 8: Create Hero section

**Files:**
- Create: `src/components/landing/hero.tsx`

**Context:**
Server Component. Two-column layout: left (headline + sub + CTAs), right (WhatsApp mockup).
Large editorial headline using `Instrument Serif`. Entrance animation on load.

**Step 1: Create the hero**

```tsx
// src/components/landing/hero.tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { WhatsAppMockup } from "./whatsapp-mockup";

const HERO_MESSAGES = [
  { text: "Olá! Quero agendar uma consulta com a Dra. Ana 😊", type: "incoming" as const, time: "14:32" },
  { text: "Oi! A Dra. Ana tem os seguintes horários disponíveis esta semana:\n\n📅 Seg 10:00\n📅 Ter 14:30\n📅 Qui 09:00\n\nQual prefere?", type: "outgoing" as const, time: "14:32" },
  { text: "Terça às 14:30, por favor!", type: "incoming" as const, time: "14:33" },
  { text: "✅ Consulta confirmada!\n\nDra. Ana Lima\nTer, 25 fev · 14:30\nClínica Saúde+\n\nVocê receberá um lembrete 24h antes.", type: "outgoing" as const, time: "14:33" },
];

export async function LandingHero() {
  const t = await getTranslations("landing.hero");

  return (
    <section
      className="relative overflow-hidden"
      style={{
        background: "linear-gradient(160deg, #faf5ff 0%, #ffffff 50%, #f0f9ff 100%)",
        paddingTop: "5rem",
        paddingBottom: "6rem",
      }}
    >
      {/* Background decoration */}
      <div
        className="pointer-events-none absolute -top-32 -right-32 size-[500px] rounded-full opacity-20"
        style={{
          background: "radial-gradient(circle, #8b5cf6 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-32 -left-32 size-[400px] rounded-full opacity-15"
        style={{
          background: "radial-gradient(circle, #06b6d4 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Left: copy */}
          <div
            className="flex flex-col gap-6 lp-animate-fade-up"
            style={{ animationDelay: "0.1s" }}
          >
            {/* Badge */}
            <div className="inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5"
              style={{ borderColor: "#ede9fe", backgroundColor: "#faf5ff" }}
            >
              <span
                className="inline-block size-2 rounded-full"
                style={{ backgroundColor: "#7c3aed" }}
              />
              <span className="text-xs font-medium" style={{ color: "#7c3aed" }}>
                {t("trustedBy")}
              </span>
            </div>

            {/* Headline */}
            <h1
              className="leading-tight tracking-tight"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--lp-hero-size)",
                color: "#0f172a",
                lineHeight: 1.1,
              }}
            >
              {t("headline1")}
              <br />
              <span style={{ color: "var(--lp-accent)" }}>{t("headline2")}</span>
            </h1>

            {/* Subtext */}
            <p
              className="max-w-lg text-lg leading-relaxed"
              style={{ color: "#475569" }}
            >
              {t("sub")}
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/signup"
                className="group flex items-center gap-2 rounded-xl px-6 py-3 text-base font-semibold text-white shadow-lg transition-all hover:shadow-xl hover:-translate-y-0.5"
                style={{
                  backgroundColor: "var(--lp-accent)",
                  boxShadow: "0 4px 20px rgba(124,58,237,0.35)",
                }}
              >
                {t("ctaPrimary")}
                <svg
                  className="size-4 transition-transform group-hover:translate-x-1"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <a
                href="#how-it-works"
                className="flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-70"
                style={{ color: "#475569", textDecoration: "none" }}
              >
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                {t("ctaSecondary")}
              </a>
            </div>

            {/* Social proof mini */}
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {["#7c3aed","#059669","#0369a1","#dc2626"].map((color, i) => (
                  <div
                    key={i}
                    className="flex size-8 items-center justify-center rounded-full border-2 border-white text-xs font-semibold text-white"
                    style={{ backgroundColor: color, zIndex: 4 - i }}
                  >
                    {["A","B","C","D"][i]}
                  </div>
                ))}
              </div>
              <p className="text-sm" style={{ color: "#475569" }}>
                <strong style={{ color: "#0f172a" }}>Novas clínicas</strong> se juntam toda semana
              </p>
            </div>
          </div>

          {/* Right: WhatsApp mockup */}
          <div
            className="flex justify-center lg:justify-end lp-animate-float"
            style={{ animationDelay: "0.4s" }}
          >
            <WhatsAppMockup
              contactName="Órbita — Clínica Saúde+"
              contactEmoji="🏥"
              messages={HERO_MESSAGES}
              className="w-full"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/landing/hero.tsx
git commit -m "feat(landing): add hero section"
```

---

### Task 9: Create Problem Bar + Agents Overview

**Files:**
- Create: `src/components/landing/problem-bar.tsx`
- Create: `src/components/landing/agents-overview.tsx`

**Step 1: Create problem-bar.tsx**

```tsx
// src/components/landing/problem-bar.tsx
import { getTranslations } from "next-intl/server";

export async function ProblemBar() {
  const t = await getTranslations("landing.problem");

  const stats = [
    { value: t("stat1Value"), label: t("stat1Label") },
    { value: t("stat2Value"), label: t("stat2Label") },
    { value: t("stat3Value"), label: t("stat3Label") },
  ];

  return (
    <section style={{ backgroundColor: "#0f172a", padding: "3rem 1.5rem" }}>
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          {stats.map((stat, i) => (
            <div key={i} className="text-center">
              <p
                className="text-4xl font-bold"
                style={{ fontFamily: "var(--font-display)", color: "#a78bfa" }}
              >
                {stat.value}
              </p>
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: "#94a3b8" }}
              >
                {stat.label}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-xs" style={{ color: "#475569" }}>
          Estimativas baseadas em dados do CFM, ABIMO e ABIMED.
        </p>
      </div>
    </section>
  );
}
```

**Step 2: Create agents-overview.tsx**

```tsx
// src/components/landing/agents-overview.tsx
import { getTranslations } from "next-intl/server";

const AGENT_ICONS: Record<string, string> = {
  scheduling: "📅",
  confirmation: "✅",
  billing: "💳",
  nps: "⭐",
  recall: "🔄",
  support: "💬",
};

const AGENT_KEYS = ["scheduling", "confirmation", "billing", "nps", "recall", "support"] as const;

export async function AgentsOverview() {
  const t = await getTranslations("landing.agents");

  return (
    <section id="agents" style={{ backgroundColor: "#fafafa", padding: "5rem 1.5rem" }}>
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <h2
            className="tracking-tight"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--lp-section-title-size)",
              color: "#0f172a",
              lineHeight: 1.2,
            }}
          >
            {t("title")}
          </h2>
          <p className="mt-4 text-lg leading-relaxed" style={{ color: "#475569" }}>
            {t("sub")}
          </p>
        </div>

        {/* Agent cards */}
        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {AGENT_KEYS.map((key) => (
            <div
              key={key}
              className="group flex flex-col gap-3 rounded-2xl border p-6 transition-all hover:-translate-y-1 hover:shadow-lg"
              style={{
                backgroundColor: "#ffffff",
                borderColor: "#e2e8f0",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              }}
            >
              <span className="text-3xl">{AGENT_ICONS[key]}</span>
              <div>
                <h3 className="font-semibold" style={{ color: "#0f172a" }}>
                  {t(`${key}.name`)}
                </h3>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "#475569" }}>
                  {t(`${key}.desc`)}
                </p>
              </div>
              <div
                className="mt-auto flex items-center gap-1 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100"
                style={{ color: "var(--lp-accent)" }}
              >
                <span
                  className="inline-block size-1.5 rounded-full"
                  style={{ backgroundColor: "var(--lp-accent)" }}
                />
                Ativo via WhatsApp
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

**Step 3: Commit both**

```bash
git add src/components/landing/problem-bar.tsx src/components/landing/agents-overview.tsx
git commit -m "feat(landing): add problem bar and agents overview sections"
```

---

### Task 10: Create How It Works section

**Files:**
- Create: `src/components/landing/how-it-works.tsx`

**Step 1: Create the component**

```tsx
// src/components/landing/how-it-works.tsx
import { getTranslations } from "next-intl/server";

export async function HowItWorks() {
  const t = await getTranslations("landing.howItWorks");

  const steps = [
    {
      number: "01",
      title: t("step1Title"),
      desc: t("step1Desc"),
      icon: "📱",
    },
    {
      number: "02",
      title: t("step2Title"),
      desc: t("step2Desc"),
      icon: "⚙️",
    },
    {
      number: "03",
      title: t("step3Title"),
      desc: t("step3Desc"),
      icon: "🤖",
    },
  ];

  return (
    <section id="how-it-works" style={{ backgroundColor: "#ffffff", padding: "5rem 1.5rem" }}>
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            className="tracking-tight"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--lp-section-title-size)",
              color: "#0f172a",
              lineHeight: 1.2,
            }}
          >
            {t("title")}
          </h2>
          <p className="mt-3 text-lg" style={{ color: "#475569" }}>
            {t("sub")}
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
          {steps.map((step, i) => (
            <div key={i} className="relative flex flex-col items-center text-center">
              {/* Connector line */}
              {i < steps.length - 1 && (
                <div
                  className="absolute left-[calc(50%+3.5rem)] top-8 hidden h-px w-[calc(100%-7rem)] md:block"
                  style={{ backgroundColor: "#e2e8f0" }}
                />
              )}

              {/* Icon circle */}
              <div
                className="flex size-16 items-center justify-center rounded-2xl text-2xl"
                style={{
                  backgroundColor: "var(--lp-accent-light)",
                  border: "1px solid #ddd6fe",
                }}
              >
                {step.icon}
              </div>

              {/* Number badge */}
              <div
                className="mt-3 inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-bold"
                style={{
                  backgroundColor: "var(--lp-accent)",
                  color: "#ffffff",
                }}
              >
                {step.number}
              </div>

              <h3
                className="mt-3 text-lg font-semibold"
                style={{ color: "#0f172a" }}
              >
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: "#64748b" }}>
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/landing/how-it-works.tsx
git commit -m "feat(landing): add how it works section"
```

---

### Task 11: Create Feature Deep-Dives section

**Files:**
- Create: `src/components/landing/feature-deep-dives.tsx`

**Context:**
4 alternating blocks (even = text-left/mockup-right, odd = mockup-left/text-right).
Each block has a tag, headline, desc, bullet list, and a WhatsApp mockup.

**Step 1: Create the component**

```tsx
// src/components/landing/feature-deep-dives.tsx
import { getTranslations } from "next-intl/server";
import { WhatsAppMockup } from "./whatsapp-mockup";
import type { ReactNode } from "react";

interface WhatsAppMessage {
  text: string;
  type: "incoming" | "outgoing";
  time?: string;
}

const FEATURE_MOCKUPS: Record<string, WhatsAppMessage[]> = {
  scheduling: [
    { text: "Oi! Quero marcar uma consulta para esta semana 😊", type: "incoming", time: "10:15" },
    { text: "Olá! Com qual profissional você prefere?\n\n• Dr. Carlos Mendes\n• Dra. Ana Lima\n• Dr. Paulo Reis", type: "outgoing", time: "10:15" },
    { text: "Dra. Ana Lima, por favor", type: "incoming", time: "10:16" },
    { text: "✅ Agendado!\n\nDra. Ana Lima\nSex, 21 fev · 15:00\n\nConfirme sua presença respondendo SIM.", type: "outgoing", time: "10:16" },
  ],
  confirmation: [
    { text: "🗓️ Lembrete: sua consulta com Dr. Carlos é amanhã, Ter 25/02 às 10:00.\n\nConfirma sua presença?", type: "outgoing", time: "09:00" },
    { text: "SIM, confirmo!", type: "incoming", time: "09:12" },
    { text: "✅ Ótimo! Te esperamos amanhã às 10:00.\n\nClínica Saúde+\nRua das Flores, 123", type: "outgoing", time: "09:12" },
  ],
  billing: [
    { text: "Olá! Sua consulta foi concluída. Aqui está o link para pagamento:\n\n💳 Valor: R$ 250,00\n⏰ Vencimento: 28/02", type: "outgoing", time: "16:30" },
    { text: "Como pago?", type: "incoming", time: "16:45" },
    { text: "Você pode pagar via:\n• Pix (instantâneo)\n• Cartão de crédito\n• Boleto\n\nO link já está disponível 👆", type: "outgoing", time: "16:45" },
  ],
  recall: [
    { text: "Olá, Marcos! 👋\n\nFaz um tempinho que não nos vemos. Tudo bem com você?\n\nQuer agendar uma consulta de retorno com a Dra. Ana?", type: "outgoing", time: "10:00" },
    { text: "Oi! Sim, estava pensando nisso. Tem horário essa semana?", type: "incoming", time: "10:23" },
    { text: "Claro! Temos:\n📅 Qui 09:00\n📅 Sex 14:00\n\nQual prefere?", type: "outgoing", time: "10:23" },
  ],
};

const FEATURE_KEYS = ["scheduling", "confirmation", "billing", "recall"] as const;

interface FeatureBlockProps {
  tag: string;
  title: string;
  desc: string;
  bullets: string[];
  mockupKey: string;
  reversed: boolean;
}

function FeatureBlock({ tag, title, desc, bullets, mockupKey, reversed }: FeatureBlockProps) {
  const messages = FEATURE_MOCKUPS[mockupKey] ?? [];

  const TextContent = (
    <div className="flex flex-col justify-center gap-5">
      <span
        className="inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold"
        style={{ backgroundColor: "var(--lp-accent-light)", color: "var(--lp-accent)" }}
      >
        {tag}
      </span>
      <h3
        className="leading-tight tracking-tight"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(1.5rem, 2.5vw, 2rem)",
          color: "#0f172a",
        }}
      >
        {title}
      </h3>
      <p className="text-base leading-relaxed" style={{ color: "#475569" }}>
        {desc}
      </p>
      <ul className="flex flex-col gap-2">
        {bullets.map((bullet, i) => (
          <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "#475569" }}>
            <svg
              className="mt-0.5 size-4 shrink-0"
              style={{ color: "var(--lp-accent)" }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            {bullet}
          </li>
        ))}
      </ul>
    </div>
  );

  const MockupContent = (
    <div className="flex justify-center">
      <WhatsAppMockup
        contactName="Órbita"
        messages={messages}
        className="w-full max-w-xs"
      />
    </div>
  );

  return (
    <div
      className="grid items-center gap-10 lg:grid-cols-2"
      style={{ padding: "4rem 0" }}
    >
      {reversed ? (
        <>
          <div className="order-2 lg:order-1">{MockupContent}</div>
          <div className="order-1 lg:order-2">{TextContent}</div>
        </>
      ) : (
        <>
          {TextContent}
          {MockupContent}
        </>
      )}
    </div>
  );
}

export async function FeatureDeepDives() {
  const t = await getTranslations("landing.features");

  return (
    <section style={{ backgroundColor: "#fafafa", padding: "3rem 1.5rem" }}>
      <div className="mx-auto max-w-6xl">
        <div
          className="divide-y"
          style={{ borderColor: "#e2e8f0" }}
        >
          {FEATURE_KEYS.map((key, i) => (
            <FeatureBlock
              key={key}
              tag={t(`${key}.tag`)}
              title={t(`${key}.title`)}
              desc={t(`${key}.desc`)}
              bullets={[
                t(`${key}.bullets.0`),
                t(`${key}.bullets.1`),
                t(`${key}.bullets.2`),
              ]}
              mockupKey={key}
              reversed={i % 2 === 1}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/landing/feature-deep-dives.tsx
git commit -m "feat(landing): add feature deep-dives section"
```

---

### Task 12: Create Differentiators section

**Files:**
- Create: `src/components/landing/differentiators.tsx`

**Step 1: Create the component**

```tsx
// src/components/landing/differentiators.tsx
import { getTranslations } from "next-intl/server";

const DIFFERENTIATOR_ICONS = ["📱", "⚡", "🏥", "🎛️"];

export async function Differentiators() {
  const t = await getTranslations("landing.differentiators");

  const items = [
    { title: t("d1Title"), desc: t("d1Desc"), icon: DIFFERENTIATOR_ICONS[0] },
    { title: t("d2Title"), desc: t("d2Desc"), icon: DIFFERENTIATOR_ICONS[1] },
    { title: t("d3Title"), desc: t("d3Desc"), icon: DIFFERENTIATOR_ICONS[2] },
    { title: t("d4Title"), desc: t("d4Desc"), icon: DIFFERENTIATOR_ICONS[3] },
  ];

  return (
    <section style={{ backgroundColor: "#ffffff", padding: "5rem 1.5rem" }}>
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--lp-section-title-size)",
              color: "#0f172a",
              lineHeight: 1.2,
            }}
          >
            {t("title")}
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, i) => (
            <div
              key={i}
              className="flex flex-col gap-4 rounded-2xl p-6"
              style={{
                backgroundColor: i === 0 ? "var(--lp-accent)" : "#f8fafc",
                color: i === 0 ? "#ffffff" : "#0f172a",
              }}
            >
              <span className="text-3xl">{item.icon}</span>
              <div>
                <h3
                  className="font-semibold"
                  style={{ color: i === 0 ? "#ffffff" : "#0f172a" }}
                >
                  {item.title}
                </h3>
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: i === 0 ? "rgba(255,255,255,0.8)" : "#475569" }}
                >
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/landing/differentiators.tsx
git commit -m "feat(landing): add differentiators section"
```

---

### Task 13: Create Pricing section

**Files:**
- Create: `src/components/landing/pricing.tsx`

**Step 1: Create the component**

```tsx
// src/components/landing/pricing.tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";

interface PricingCardProps {
  name: string;
  price: string;
  monthly: string;
  desc: string;
  features: string[];
  isRecommended: boolean;
  recommended: string;
  ctaLabel: string;
  ctaHref: string;
}

function PricingCard({
  name,
  price,
  monthly,
  desc,
  features,
  isRecommended,
  recommended,
  ctaLabel,
  ctaHref,
}: PricingCardProps) {
  return (
    <div
      className="relative flex flex-col gap-6 rounded-2xl border p-8"
      style={{
        backgroundColor: isRecommended ? "var(--lp-accent)" : "#ffffff",
        borderColor: isRecommended ? "transparent" : "#e2e8f0",
        boxShadow: isRecommended
          ? "0 20px 40px rgba(124,58,237,0.3)"
          : "0 1px 3px rgba(0,0,0,0.05)",
        transform: isRecommended ? "scale(1.03)" : "none",
      }}
    >
      {isRecommended && (
        <div
          className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-xs font-bold"
          style={{ backgroundColor: "#f59e0b", color: "#ffffff" }}
        >
          {recommended}
        </div>
      )}

      <div>
        <h3
          className="text-lg font-semibold"
          style={{ color: isRecommended ? "#ffffff" : "#0f172a" }}
        >
          {name}
        </h3>
        <p
          className="mt-1 text-sm"
          style={{ color: isRecommended ? "rgba(255,255,255,0.75)" : "#64748b" }}
        >
          {desc}
        </p>
      </div>

      <div>
        <span
          className="text-4xl font-bold"
          style={{
            fontFamily: "var(--font-display)",
            color: isRecommended ? "#ffffff" : "#0f172a",
          }}
        >
          {price}
        </span>
        <span
          className="ml-1 text-sm"
          style={{ color: isRecommended ? "rgba(255,255,255,0.7)" : "#94a3b8" }}
        >
          /{monthly}
        </span>
      </div>

      <ul className="flex flex-col gap-2.5">
        {features.map((feature, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            <svg
              className="size-4 shrink-0"
              style={{ color: isRecommended ? "#a78bfa" : "var(--lp-accent)" }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            <span style={{ color: isRecommended ? "rgba(255,255,255,0.9)" : "#374151" }}>
              {feature}
            </span>
          </li>
        ))}
      </ul>

      <Link
        href={ctaHref}
        className="mt-auto block w-full rounded-xl py-3 text-center text-sm font-semibold transition-all hover:opacity-90"
        style={{
          backgroundColor: isRecommended ? "#ffffff" : "var(--lp-accent)",
          color: isRecommended ? "var(--lp-accent)" : "#ffffff",
        }}
      >
        {ctaLabel}
      </Link>
    </div>
  );
}

export async function Pricing() {
  const t = await getTranslations("landing.pricing");

  const plans = [
    {
      key: "plan1" as const,
      ctaHref: "/signup",
      ctaLabel: t("ctaStart"),
      isRecommended: false,
    },
    {
      key: "plan2" as const,
      ctaHref: "/signup",
      ctaLabel: t("ctaStart"),
      isRecommended: true,
    },
    {
      key: "plan3" as const,
      ctaHref: "/signup",
      ctaLabel: t("ctaContact"),
      isRecommended: false,
    },
  ];

  return (
    <section id="pricing" style={{ backgroundColor: "#fafafa", padding: "5rem 1.5rem" }}>
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--lp-section-title-size)",
              color: "#0f172a",
              lineHeight: 1.2,
            }}
          >
            {t("title")}
          </h2>
          <p className="mt-3 text-lg" style={{ color: "#475569" }}>
            {t("sub")}
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 items-center gap-6 md:grid-cols-3">
          {plans.map((plan) => (
            <PricingCard
              key={plan.key}
              name={t(`${plan.key}Name`)}
              price={t(`${plan.key}Price`)}
              monthly={t("monthly")}
              desc={t(`${plan.key}Desc`)}
              features={[
                t(`${plan.key}Features.0`),
                t(`${plan.key}Features.1`),
                t(`${plan.key}Features.2`),
                t(`${plan.key}Features.3`),
                ...(plan.key === "plan2" || plan.key === "plan3"
                  ? [t(`${plan.key}Features.4`)]
                  : []),
              ].filter(Boolean)}
              isRecommended={plan.isRecommended}
              recommended={t("recommended")}
              ctaLabel={plan.ctaLabel}
              ctaHref={plan.ctaHref}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/landing/pricing.tsx
git commit -m "feat(landing): add pricing section"
```

---

### Task 14: Create FAQ section (client component)

**Files:**
- Create: `src/components/landing/faq.tsx`

**Context:**
The FAQ needs `"use client"` for accordion open/close state. Uses `useTranslations` instead
of `getTranslations`. This is the only client component in the landing page.

**Step 1: Create the client component**

```tsx
// src/components/landing/faq.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

const FAQ_KEYS = ["q1", "q2", "q3", "q4", "q5"] as const;

interface FaqItemProps {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}

function FaqItem({ question, answer, isOpen, onToggle }: FaqItemProps) {
  return (
    <div
      className="border-b"
      style={{ borderColor: "#e2e8f0" }}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between py-5 text-left"
        type="button"
      >
        <span className="pr-8 text-base font-medium" style={{ color: "#0f172a" }}>
          {question}
        </span>
        <svg
          className="size-5 shrink-0 transition-transform duration-200"
          style={{
            color: "var(--lp-accent)",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="pb-5">
          <p className="text-sm leading-relaxed" style={{ color: "#64748b" }}>
            {answer}
          </p>
        </div>
      )}
    </div>
  );
}

export function Faq() {
  const t = useTranslations("landing.faq");
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section style={{ backgroundColor: "#ffffff", padding: "5rem 1.5rem" }}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-12 text-center">
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--lp-section-title-size)",
              color: "#0f172a",
              lineHeight: 1.2,
            }}
          >
            {t("title")}
          </h2>
        </div>

        <div>
          {FAQ_KEYS.map((key, i) => (
            <FaqItem
              key={key}
              question={t(key)}
              answer={t(key.replace("q", "a") as `a${1 | 2 | 3 | 4 | 5}`)}
              isOpen={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? null : i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/landing/faq.tsx
git commit -m "feat(landing): add FAQ accordion section"
```

---

### Task 15: Create Final CTA + Footer

**Files:**
- Create: `src/components/landing/final-cta.tsx`
- Create: `src/components/landing/footer.tsx`

**Step 1: Create final-cta.tsx**

```tsx
// src/components/landing/final-cta.tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function FinalCta() {
  const t = await getTranslations("landing.finalCta");

  return (
    <section
      style={{
        background: "linear-gradient(135deg, #4c1d95 0%, #7c3aed 50%, #6d28d9 100%)",
        padding: "6rem 1.5rem",
      }}
    >
      <div className="mx-auto max-w-3xl text-center">
        <h2
          className="text-white"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--lp-section-title-size)",
            lineHeight: 1.2,
          }}
        >
          {t("title")}
        </h2>
        <p className="mt-4 text-lg" style={{ color: "rgba(255,255,255,0.8)" }}>
          {t("sub")}
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-bold transition-all hover:shadow-2xl hover:-translate-y-0.5"
            style={{ color: "var(--lp-accent)" }}
          >
            {t("cta")}
            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
            {t("noCc")}
          </p>
        </div>
      </div>
    </section>
  );
}
```

**Step 2: Create footer.tsx**

```tsx
// src/components/landing/footer.tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function LandingFooter() {
  const t = await getTranslations("landing.footer");

  const links = {
    [t("product")]: [
      { label: t("features"), href: "#agents" },
      { label: t("pricing"), href: "#pricing" },
      { label: t("docs"), href: "#" },
    ],
    [t("company")]: [
      { label: t("about"), href: "#" },
      { label: t("blog"), href: "#" },
      { label: t("contact"), href: "#" },
    ],
    [t("legal")]: [
      { label: t("terms"), href: "#" },
      { label: t("privacy"), href: "#" },
    ],
  };

  return (
    <footer
      style={{
        backgroundColor: "#0f172a",
        padding: "4rem 1.5rem 2rem",
      }}
    >
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2">
              <div
                className="flex size-8 items-center justify-center rounded-lg text-sm font-bold text-white"
                style={{ backgroundColor: "var(--lp-accent)" }}
              >
                O
              </div>
              <span className="text-lg font-semibold text-white">Órbita</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "#64748b" }}>
              {t("tagline")}
            </p>
            {/* Social */}
            <div className="mt-4 flex gap-3">
              {[
                { label: "Instagram", icon: "📸" },
                { label: "LinkedIn", icon: "💼" },
              ].map((s) => (
                <a
                  key={s.label}
                  href="#"
                  className="flex size-8 items-center justify-center rounded-lg text-sm transition-colors hover:bg-white/10"
                  style={{ color: "#64748b" }}
                  aria-label={s.label}
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(links).map(([groupName, groupLinks]) => (
            <div key={groupName}>
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest" style={{ color: "#94a3b8" }}>
                {groupName}
              </p>
              <ul className="flex flex-col gap-2.5">
                {groupLinks.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm transition-colors hover:text-white"
                      style={{ color: "#64748b", textDecoration: "none" }}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          className="mt-10 flex flex-col items-center justify-between gap-4 border-t pt-8 sm:flex-row"
          style={{ borderColor: "#1e293b" }}
        >
          <p className="text-xs" style={{ color: "#475569" }}>
            © {new Date().getFullYear()} Órbita. {t("rights")}
          </p>
          <p className="text-xs" style={{ color: "#475569" }}>
            Feito com ♥ para clínicas brasileiras
          </p>
        </div>
      </div>
    </footer>
  );
}
```

**Step 3: Commit both**

```bash
git add src/components/landing/final-cta.tsx src/components/landing/footer.tsx
git commit -m "feat(landing): add final CTA and footer sections"
```

---

## PHASE 3 — Assembly & Verification

### Task 16: Assemble the landing page

**Files:**
- Create: `src/app/(marketing)/page.tsx`

**Context:**
Composes all section components in order. Server Component.
Each section has its own scroll anchor ID.

**Step 1: Create the page**

```tsx
// src/app/(marketing)/page.tsx
import { LandingNavbar } from "@/components/landing/navbar";
import { LandingHero } from "@/components/landing/hero";
import { ProblemBar } from "@/components/landing/problem-bar";
import { AgentsOverview } from "@/components/landing/agents-overview";
import { HowItWorks } from "@/components/landing/how-it-works";
import { FeatureDeepDives } from "@/components/landing/feature-deep-dives";
import { Differentiators } from "@/components/landing/differentiators";
import { Pricing } from "@/components/landing/pricing";
import { Faq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
import { LandingFooter } from "@/components/landing/footer";

export default function LandingPage() {
  return (
    <>
      <LandingNavbar />
      <main>
        <LandingHero />
        <ProblemBar />
        <AgentsOverview />
        <HowItWorks />
        <FeatureDeepDives />
        <Differentiators />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <LandingFooter />
    </>
  );
}
```

**Step 2: Commit**

```bash
git add "src/app/(marketing)/page.tsx"
git commit -m "feat(landing): assemble landing page"
```

---

### Task 17: TypeScript + Build Verification

**Step 1: Run TypeScript check**

```bash
cd "c:/Users/KABUM/Documents/BALAM SANDBOX/supermvp/health-agents/.worktrees/features-landing-page"
npx tsc --noEmit 2>&1
```

Expected: No errors. If there are errors, fix them before proceeding.

**Common fixes needed:**
- `t('key')` calls where key doesn't exist in translations → verify keys match pt-BR.json
- Missing imports → add them
- Type mismatches in component props → check interfaces

**Step 2: Run build**

```bash
npm run build 2>&1 | tail -50
```

Expected: Build completes successfully. If it fails:
- Check for missing `"use client"` on components using hooks
- Check for async/await in Server Components that need it
- Check for missing translations keys

**Step 3: If build passes, create final commit**

```bash
git add -A
git commit -m "feat(landing): complete landing page implementation"
```

---

## Summary

After completing all tasks, the landing page will be live at `/` with:
- Public access (no auth required)
- 12 sections: Navbar, Hero, Problem Bar, Agents, How It Works, Feature Deep-Dives, Differentiators, Pricing, FAQ, Final CTA, Footer
- Instrument Serif + DM Sans typography
- WhatsApp mockup UI component used in 5 feature blocks
- All text in `messages/pt-BR.json` under `landing.*` namespace
- 14-day free trial CTA pointing to `/signup`
- Dashboard moved to `/dashboard`
