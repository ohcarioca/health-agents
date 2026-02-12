"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function handleGoogleLogin() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <div>
      <h1
        className="text-2xl font-semibold tracking-tight text-center"
        style={{ color: "var(--text-primary)" }}
      >
        {t("login.title")}
      </h1>
      <p
        className="mt-2 text-sm text-center"
        style={{ color: "var(--text-secondary)" }}
      >
        {t("login.subtitle")}
      </p>

      <form onSubmit={handleLogin} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            {t("login.email")}
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
            {t("login.password")}
          </label>
          <input
            id="password"
            type="password"
            required
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
          {loading ? t("login.loading") : t("login.submit")}
        </button>
      </form>

      <div className="mt-4">
        <button
          onClick={handleGoogleLogin}
          className="w-full rounded-lg border px-4 py-2 text-sm font-medium transition-colors"
          style={{
            borderColor: "var(--border)",
            color: "var(--text-primary)",
          }}
        >
          {t("login.google")}
        </button>
      </div>

      <p
        className="mt-4 text-center text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        {t("login.noAccount")}{" "}
        <a href="/signup" style={{ color: "var(--accent)" }}>
          {t("login.signupLink")}
        </a>
      </p>
    </div>
  );
}
