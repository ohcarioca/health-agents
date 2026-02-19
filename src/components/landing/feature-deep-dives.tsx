import { getTranslations } from "next-intl/server";
import { WhatsAppMockup } from "./whatsapp-mockup";

interface WhatsAppMsg {
  text: string;
  type: "incoming" | "outgoing";
  time?: string;
}

const FEATURE_MOCKUPS: Record<string, WhatsAppMsg[]> = {
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
        <div className="divide-y" style={{ borderColor: "#e2e8f0" }}>
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
