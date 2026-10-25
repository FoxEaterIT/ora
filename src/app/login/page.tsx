"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Input } from "@/components/ui";
import { APP_NAME, APP_TAGLINE, appLogoForTheme } from "@/lib/app-config";
import { useI18n } from "@/i18n/provider";

type LoginStep = "email" | "password" | "activation";

/** Single entry point: account lookup chooses activation or normal sign-in. */
export default function LoginPage() {
  const { messages } = useI18n();
  const t = messages.auth;
  const router = useRouter();
  const [step, setStep] = useState<LoginStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch("/api/setup").then((response) => response.json()).then((data) => {
      if (data.setupRequired) router.replace("/setup");
    }).catch(() => undefined);
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);

    try {
      const endpoint = step === "activation" ? "/api/auth/activate" : "/api/auth/login";
      const payload = step === "email"
        ? { email }
        : step === "activation"
          ? { email, password, confirmPassword }
          : { email, password };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? t.operationFailed);
        return;
      }

      if (data.firstLogin) {
        setPassword("");
        setConfirmPassword("");
        setStep("activation");
        return;
      }

      if (data.passwordRequired) {
        // For an active account, request the password in the next step.
        setStep("password");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError(t.requestFailed);
    } finally {
      setPending(false);
    }
  }

  const title = step === "activation" ? t.loginActivation : step === "password" ? t.welcomeBack : `${t.signIn} ${APP_NAME}`;
  const buttonLabel = step === "activation" ? t.setPasswordSignIn : step === "password" ? t.signIn : t.continue;
  const loginLogo = appLogoForTheme("light");

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-[var(--shadow)] sm:p-8">
        <div className="mb-8 flex items-center gap-3">
          {loginLogo ? <Image src={loginLogo} alt="" width={160} height={48} unoptimized className="max-h-12 max-w-40 object-contain" /> : <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand text-xl font-semibold text-brand-ink">{APP_NAME.slice(0, 1).toUpperCase()}</span>}
          <div className="min-w-0">
            <p className="mb-1 text-sm font-semibold">{APP_NAME} <span className="font-normal text-muted">· {APP_TAGLINE}</span></p>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted">
              {step === "activation" ? t.firstAccess : t.enterEmail}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium text-muted">{messages.app.email}</span>
            <Input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              readOnly={step !== "email"}
              className="read-only:opacity-70"
              placeholder="name@company.com"
            />
          </label>

          {step !== "email" ? (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-muted">{messages.app.password}</span>
              <Input
                required
                type="password"
                minLength={step === "activation" ? 8 : 1}
                autoComplete={step === "activation" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          ) : null}

          {step === "activation" ? (
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-muted">{t.confirmPassword}</span>
              <Input
                required
                type="password"
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </label>
          ) : null}

          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}

          <button disabled={pending} className="mt-2 rounded-xl bg-brand px-4 py-3 font-medium text-white disabled:opacity-50">
            {pending ? t.wait : buttonLabel}
          </button>

          {step !== "email" ? (
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setPassword("");
                setConfirmPassword("");
                setError("");
              }}
              className="text-sm text-muted hover:text-ink"
            >
              {t.otherEmail}
            </button>
          ) : null}
        </div>
      </form>
    </main>
  );
}
