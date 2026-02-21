"use client";

import { useState, useCallback, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface CreditCardFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planName: string;
  planPrice: string;
  mode: "subscribe" | "update-card";
  planSlug?: string;
  onSuccess: () => void;
}

function formatCardNumber(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 19);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function formatExpiry(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length >= 3) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return digits;
}

function formatCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 11) {
    if (digits.length > 9)
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    if (digits.length > 6)
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    if (digits.length > 3)
      return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    return digits;
  }
  if (digits.length > 12)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  if (digits.length > 8)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  if (digits.length > 5)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length > 2)
    return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  return digits;
}

function formatPostalCode(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length > 5) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  }
  return digits;
}

export function CreditCardForm({
  open,
  onOpenChange,
  planName,
  planPrice,
  mode,
  planSlug,
  onSuccess,
}: CreditCardFormProps) {
  const t = useTranslations("subscription");

  // Card fields
  const [holderName, setHolderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");

  // Holder info fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [phone, setPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [addressNumber, setAddressNumber] = useState("");

  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const resetForm = useCallback(() => {
    setHolderName("");
    setCardNumber("");
    setExpiry("");
    setCvv("");
    setName("");
    setEmail("");
    setCpfCnpj("");
    setPhone("");
    setPostalCode("");
    setAddressNumber("");
    setFieldErrors({});
    setLoading(false);
  }, []);

  function handleOpenChange(value: boolean) {
    if (!value) {
      resetForm();
    }
    onOpenChange(value);
  }

  function parseExpiry(raw: string): { month: string; year: string } {
    const digits = raw.replace(/\D/g, "");
    const month = digits.slice(0, 2);
    const yearShort = digits.slice(2, 4);
    const year = yearShort.length === 2 ? `20${yearShort}` : yearShort;
    return { month, year };
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};
    const cardDigits = cardNumber.replace(/\D/g, "");
    const expiryDigits = expiry.replace(/\D/g, "");
    const cvvDigits = cvv.replace(/\D/g, "");
    const cpfDigits = cpfCnpj.replace(/\D/g, "");
    const postalDigits = postalCode.replace(/\D/g, "");

    // Card validation
    if (holderName.trim().length < 3) errors.holderName = "min3";
    if (cardDigits.length < 13 || cardDigits.length > 19) errors.cardNumber = "invalid";
    if (expiryDigits.length !== 4) errors.expiry = "invalid";
    else {
      const month = parseInt(expiryDigits.slice(0, 2), 10);
      if (month < 1 || month > 12) errors.expiry = "invalid";
    }
    if (cvvDigits.length < 3 || cvvDigits.length > 4) errors.cvv = "invalid";

    // Holder info validation
    if (name.trim().length < 3) errors.name = "min3";
    if (!email.includes("@") || !email.includes(".")) errors.email = "invalid";
    if (cpfDigits.length < 11 || cpfDigits.length > 14) errors.cpfCnpj = "invalid";
    if (postalDigits.length !== 8) errors.postalCode = "invalid";
    if (addressNumber.trim().length === 0) errors.addressNumber = "required";

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);

    const cardDigits = cardNumber.replace(/\D/g, "");
    const cvvDigits = cvv.replace(/\D/g, "");
    const { month, year } = parseExpiry(expiry);
    const cpfDigits = cpfCnpj.replace(/\D/g, "");
    const postalDigits = postalCode.replace(/\D/g, "");
    const phoneDigits = phone.replace(/\D/g, "") || undefined;

    const creditCard = {
      holderName: holderName.trim(),
      number: cardDigits,
      expiryMonth: month,
      expiryYear: year,
      ccv: cvvDigits,
    };

    const creditCardHolderInfo = {
      name: name.trim(),
      email: email.trim(),
      cpfCnpj: cpfDigits,
      postalCode: postalDigits,
      addressNumber: addressNumber.trim(),
      ...(phoneDigits ? { mobilePhone: phoneDigits } : {}),
    };

    try {
      const url =
        mode === "subscribe"
          ? "/api/subscriptions"
          : "/api/subscriptions/update-card";
      const method = mode === "subscribe" ? "POST" : "PUT";

      const body =
        mode === "subscribe"
          ? { planSlug, creditCard, creditCardHolderInfo }
          : { creditCard, creditCardHolderInfo };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message =
          (data as { error?: string } | null)?.error ?? t("actions.subscribe");
        throw new Error(message);
      }

      toast.success(
        mode === "subscribe"
          ? t("actions.subscribe", { price: planPrice })
          : t("actions.updateCard")
      );

      resetForm();
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : String(err);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  const dialogTitle =
    mode === "subscribe"
      ? t("actions.subscribe", { price: planPrice })
      : t("actions.updateCard");

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title={dialogTitle}
      size="lg"
    >
      {/* Plan summary */}
      <div
        className="mb-6 rounded-lg border px-4 py-3"
        style={{
          backgroundColor: "var(--accent-muted)",
          borderColor: "var(--border)",
        }}
      >
        <p
          className="text-sm font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          {planName}
        </p>
        <p
          className="text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          {planPrice}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section: Holder info */}
        <div className="space-y-4">
          <h3
            className="text-sm font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            {t("holder.title")}
          </h3>

          <Input
            id="holder-name"
            label={t("holder.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={fieldErrors.name}
            autoComplete="name"
          />

          <Input
            id="holder-cpf"
            label={t("holder.cpfCnpj")}
            value={cpfCnpj}
            onChange={(e) => setCpfCnpj(formatCpfCnpj(e.target.value))}
            error={fieldErrors.cpfCnpj}
            inputMode="numeric"
            placeholder="000.000.000-00"
            autoComplete="off"
          />

          <Input
            id="holder-email"
            label={t("holder.email")}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldErrors.email}
            autoComplete="email"
          />

          <Input
            id="holder-phone"
            label={t("holder.phone")}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={fieldErrors.phone}
            inputMode="tel"
            autoComplete="tel"
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              id="holder-postal"
              label={t("holder.postalCode")}
              value={postalCode}
              onChange={(e) => setPostalCode(formatPostalCode(e.target.value))}
              error={fieldErrors.postalCode}
              inputMode="numeric"
              placeholder="00000-000"
              autoComplete="postal-code"
            />

            <Input
              id="holder-address-number"
              label={t("holder.addressNumber")}
              value={addressNumber}
              onChange={(e) => setAddressNumber(e.target.value)}
              error={fieldErrors.addressNumber}
              autoComplete="off"
            />
          </div>
        </div>

        {/* Section: Card details */}
        <div className="space-y-4">
          <h3
            className="text-sm font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            {t("card.title")}
          </h3>

          <Input
            id="card-holder-name"
            label={t("card.holderName")}
            value={holderName}
            onChange={(e) => setHolderName(e.target.value)}
            error={fieldErrors.holderName}
            autoComplete="cc-name"
          />

          <Input
            id="card-number"
            label={t("card.number")}
            value={cardNumber}
            onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
            error={fieldErrors.cardNumber}
            inputMode="numeric"
            placeholder="0000 0000 0000 0000"
            autoComplete="cc-number"
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              id="card-expiry"
              label={t("card.expiry")}
              value={expiry}
              onChange={(e) => setExpiry(formatExpiry(e.target.value))}
              error={fieldErrors.expiry}
              inputMode="numeric"
              placeholder="MM/AA"
              autoComplete="cc-exp"
            />

            <Input
              id="card-cvv"
              label={t("card.cvv")}
              value={cvv}
              onChange={(e) =>
                setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              error={fieldErrors.cvv}
              inputMode="numeric"
              placeholder="000"
              autoComplete="cc-csc"
            />
          </div>
        </div>

        {/* Submit */}
        <Button
          type="submit"
          loading={loading}
          className="w-full"
          size="lg"
        >
          {mode === "subscribe"
            ? t("actions.subscribe", { price: planPrice })
            : t("actions.updateCard")}
        </Button>
      </form>
    </Dialog>
  );
}
