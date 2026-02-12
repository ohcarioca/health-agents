"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [clinicName, setClinicName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, clinicName }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || t("common.error"));
      setLoading(false);
      return;
    }

    // Auto-login after signup
    const supabase = createClient();
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (loginError) {
      setError(loginError.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div>
      <h1
        className="text-2xl font-semibold tracking-tight text-center"
        style={{ color: "var(--text-primary)" }}
      >
        {t("signup.title")}
      </h1>
      <p
        className="mt-2 text-sm text-center"
        style={{ color: "var(--text-secondary)" }}
      >
        {t("signup.subtitle")}
      </p>

      <form onSubmit={handleSignup} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="clinicName"
            className="block text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {t("signup.clinicName")}
          </label>
          <input
            id="clinicName"
            type="text"
            required
            value={clinicName}
            onChange={(e) => setClinicName(e.target.value)}
            className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </div>
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {t("signup.email")}
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {t("signup.password")}
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
            }}
          />
        </div>

        {error && (
          <p className="text-xs" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-70"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {loading ? t("signup.loading") : t("signup.submit")}
        </button>
      </form>

      <p
        className="mt-4 text-center text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        {t("signup.hasAccount")}{" "}
        <a href="/login" style={{ color: "var(--accent)" }}>
          {t("signup.loginLink")}
        </a>
      </p>
    </div>
  );
}
