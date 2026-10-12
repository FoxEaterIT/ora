"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Image from "next/image";
import { Input } from "@/components/ui";
import { APP_NAME, APP_TAGLINE, appLogoForTheme } from "@/lib/app-config";
import { useI18n } from "@/i18n/provider";

export default function SetupPage() {
  const { messages } = useI18n();
  const t = messages.auth;
  const router = useRouter();
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    fetch("/api/setup").then((response) => response.json()).then((data) => {
      if (!data.setupRequired) router.replace("/login");
    }).catch(() => setError(t.setupStatusFailed));
  }, [router, t.setupStatusFailed]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, email, password, confirmPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? t.setupFailed);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError(t.setupRequestFailed);
    } finally {
      setPending(false);
    }
  }

  const logo = appLogoForTheme("light");
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-[2rem] border border-line bg-surface p-8 shadow-[var(--shadow)]">
        <div className="mb-8 flex items-center gap-3">
          {logo ? <Image src={logo} alt="" width={160} height={48} unoptimized className="max-h-12 max-w-40 object-contain" /> : <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand text-xl font-semibold text-brand-ink">{APP_NAME.slice(0, 1).toUpperCase()}</span>}
          <div>
            <p className="mb-1 text-sm font-semibold">{APP_NAME} <span className="font-normal text-muted">· {APP_TAGLINE}</span></p>
            <h1 className="text-2xl font-semibold tracking-tight">{t.setupTitle}</h1>
            <p className="text-sm text-muted">{t.setupSubtitle}</p>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm"><span className="font-medium text-muted">{t.setupCode}</span><Input required type="password" autoComplete="off" value={code} onChange={(event) => setCode(event.target.value)} /></label>
          <label className="flex flex-col gap-1.5 text-sm"><span className="font-medium text-muted">{t.ownerEmail}</span><Input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" /></label>
          <label className="flex flex-col gap-1.5 text-sm"><span className="font-medium text-muted">{t.passwordMin}</span><Input required type="password" minLength={8} maxLength={100} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <label className="flex flex-col gap-1.5 text-sm"><span className="font-medium text-muted">{t.confirmPassword}</span><Input required type="password" minLength={8} maxLength={100} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          <button disabled={pending} className="mt-2 rounded-xl bg-brand px-4 py-3 font-medium text-white disabled:opacity-50">{pending ? t.wait : t.createOwner}</button>
        </div>
      </form>
    </main>
  );
}
