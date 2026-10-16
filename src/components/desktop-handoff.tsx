"use client";

import { useEffect, useState } from "react";

/** Creates a short-lived handoff only from an already authenticated browser session. */
export function DesktopHandoff() {
  const [status, setStatus] = useState("");
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => setIsDesktop(new URLSearchParams(location.search).has("desktop")), []);
  if (!isDesktop) return null;

  async function createHandoff() {
    setStatus("Creating a one-time desktop sign-in link…");
    const response = await fetch("/api/desktop/handoff", { method: "POST" });
    const data = await response.json();
    if (!response.ok) { setStatus(data.error ?? "Could not create link."); return; }
    const code = data.code;
    if (typeof code !== "string") { setStatus("Could not create a one-time code."); return; }
    try {
      await navigator.clipboard.writeText(code);
      setStatus("One-time code copied. Paste it into Ora Desktop within 60 seconds.");
    } catch {
      setStatus(`Copy this one-time code into Ora Desktop within 60 seconds: ${code}`);
    }
  }
  return <aside className="m-4 rounded-xl border border-line bg-surface p-4"><p className="mb-2 text-sm">Sign in on this page first, then create a temporary desktop sign-in link. It works once and expires in 60 seconds.</p><button className="rounded-lg bg-brand px-4 py-2 text-brand-ink" onClick={createHandoff}>Connect Ora Desktop</button><p aria-live="polite" className="mt-2 text-sm text-muted">{status}</p></aside>;
}
