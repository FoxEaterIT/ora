"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Clock3, DatabaseBackup, FolderKanban, LayoutDashboard, LogOut, Menu, Moon, Palette, Sun, Timer, UserRound, Users, UsersRound, X, Settings2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME, APP_TAGLINE, AVAILABLE_THEMES, EFFECTIVE_DEFAULT_THEME, appLogoForTheme } from "@/lib/app-config";
import { locales } from "@/i18n/messages";
import { useI18n } from "@/i18n/provider";

export type SessionUser = { id: string; firstName: string; lastName: string; name: string; email: string; role: "OWNER" | "ADMIN" | "USER" };

const THEMES = AVAILABLE_THEMES;

export function Shell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { locale, messages, setLocale } = useI18n();
  const manager = user.role !== "USER";
  const owner = user.role === "OWNER";
  const [theme, setTheme] = useState(EFFECTIVE_DEFAULT_THEME);
  const [lightTheme, setLightTheme] = useState(EFFECTIVE_DEFAULT_THEME);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [themesOpen, setThemesOpen] = useState(false);
  const [update, setUpdate] = useState<{ currentVersion: string; latestVersion: string; releaseUrl: string } | null>(null);
  const [updateStatus, setUpdateStatus] = useState<{ phase: string; message: string; targetVersion: string } | null>(null);
  const [updaterAvailable, setUpdaterAvailable] = useState(false);
  const [updateError, setUpdateError] = useState(false);
  const [updating, setUpdating] = useState(false);
  const brandLogo = appLogoForTheme(theme);

  useEffect(() => {
    const allowedThemes: string[] = THEMES.map((item) => item.value);
    const storedTheme = localStorage.getItem("ora-theme");
    const storedLightTheme = localStorage.getItem("ora-light-theme");
    const saved = storedTheme === "dark" ? "dark" : allowedThemes.includes(storedTheme ?? "") ? storedTheme! : EFFECTIVE_DEFAULT_THEME;
    const savedLight = allowedThemes.includes(storedLightTheme ?? "")
      ? storedLightTheme!
      : saved === "dark" ? EFFECTIVE_DEFAULT_THEME : saved;
    setLightTheme(savedLight);
    setTheme(saved);
    document.documentElement.dataset.theme = saved;
    localStorage.setItem("ora-theme", saved);
    localStorage.setItem("ora-light-theme", savedLight);
  }, []);

  useEffect(() => {
    if (!manager) return;
    let active = true;
    fetch("/api/version", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (active && data?.updateAvailable && typeof data.latestVersion === "string" && typeof data.releaseUrl === "string") {
          setUpdate({ currentVersion: data.currentVersion, latestVersion: data.latestVersion, releaseUrl: data.releaseUrl });
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [manager]);

  useEffect(() => {
    if (!manager) return;
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch("/api/update", { cache: "no-store" });
        const data = await response.json();
        if (!active) return;
        setUpdaterAvailable(response.ok && data.available === true);
        if (data.status) {
          setUpdateStatus(data.status);
          setUpdating(!["idle", "succeeded", "failed"].includes(data.status.phase));
          if (["succeeded", "failed"].includes(data.status.phase)) setUpdateError(false);
        }
      } catch {
        if (active && updating) setUpdateError(true);
      }
    };
    void poll();
    const interval = window.setInterval(() => { void poll(); }, 3000);
    return () => { active = false; window.clearInterval(interval); };
  }, [manager, updating]);

  async function startUpdate() {
    if (!window.confirm(messages.updateConfirm)) return;
    setUpdateError(false);
    try {
      const response = await fetch("/api/update", { method: "POST" });
      if (!response.ok) setUpdateError(true);
      else setUpdateStatus({ phase: "queued", message: "", targetVersion: update?.latestVersion ?? "" });
    } catch { setUpdateError(true); }
  }

  useEffect(() => {
    setDrawerOpen(false);
    setAccountOpen(false);
    setThemesOpen(false);
  }, [pathname]);

  function toggleTheme() {
    const next = theme === "dark" ? lightTheme : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("ora-theme", next);
    if (next !== "dark") localStorage.setItem("ora-light-theme", next);
    setThemesOpen(false);
  }

  function selectLightTheme(next: string) {
    setTheme(next);
    setLightTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("ora-theme", next);
    localStorage.setItem("ora-light-theme", next);
    setThemesOpen(false);
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const links = [
    { href: "/", label: messages.timer, icon: Timer },
    { href: "/timesheet", label: messages.myHours, icon: Clock3 },
    { href: "/projects", label: messages.projects, icon: FolderKanban },
    ...(manager
      ? [
          { href: "/manage/report", label: messages.reports, icon: LayoutDashboard },
          { href: "/manage/teams", label: messages.teams, icon: UsersRound },
          { href: "/manage/people", label: messages.people, icon: Users },
          ...(owner ? [{ href: "/manage/backups", label: messages.backups, icon: DatabaseBackup }] : []),
        ]
      : []),
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 h-16 border-b border-line bg-surface/95 shadow-sm backdrop-blur">
        <div className="mx-auto grid h-full max-w-[1400px] grid-cols-3 items-center px-4 sm:px-6">
          <div className="flex items-center">
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label={messages.openNavigation}
              className="grid h-10 w-10 place-items-center rounded-xl text-muted transition hover:bg-bg hover:text-ink"
            >
              <Menu size={21} />
            </button>
          </div>
          <Link href="/" className="flex items-center justify-center gap-2.5 justify-self-center text-ink" aria-label={`${APP_NAME} - ${messages.home}`}>
            {brandLogo ? <Image src={brandLogo} alt="" width={144} height={36} unoptimized className="max-h-9 max-w-36 object-contain" /> : <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-lg font-bold text-brand-ink shadow-sm">{APP_NAME.slice(0, 1).toUpperCase()}</span>}
            <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
          </Link>
          <div className="flex items-center justify-end gap-1">
            {theme !== "dark" && (
              <div className="relative">
                <button
                  onClick={() => { setThemesOpen((open) => !open); setAccountOpen(false); }}
                  aria-label={messages.theme}
                  aria-expanded={themesOpen}
                  title={`${messages.themeLabel}: ${THEMES.find((item) => item.value === lightTheme)?.label || THEMES[0].label}`}
                  className="grid h-10 w-10 place-items-center rounded-xl text-muted transition hover:bg-bg hover:text-ink"
                >
                  <Palette size={19} />
                </button>
                {themesOpen && (
                  <div className="absolute right-0 top-12 z-50 w-52 rounded-2xl border border-line bg-surface p-2 shadow-[var(--shadow)]">
                    <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-muted">{messages.lightTheme}</p>
                    {THEMES.map((item) => (
                      <button
                        key={item.value}
                        onClick={() => selectLightTheme(item.value)}
                        className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-bg", lightTheme === item.value ? "font-semibold text-ink" : "text-muted")}
                      >
                        <span className="h-3.5 w-3.5 rounded-full ring-2 ring-surface ring-offset-1 ring-offset-surface" style={{ backgroundColor: item.color }} />
                        {item.label}
                        {lightTheme === item.value && <span className="ml-auto text-brand">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              onClick={toggleTheme}
              aria-label={theme === "dark" ? messages.lightMode : messages.darkMode}
              title={theme === "dark" ? messages.lightMode : messages.darkMode}
              className="grid h-10 w-10 place-items-center rounded-xl text-muted transition hover:bg-bg hover:text-ink"
            >
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <label className="sr-only" htmlFor="ora-language">{messages.language}</label>
            <select id="ora-language" aria-label={messages.language} value={locale} onChange={(event) => setLocale(event.target.value as typeof locale)} className="max-w-20 rounded-lg border border-line bg-surface px-1 py-2 text-xs text-ink sm:max-w-28 sm:px-2">
              {locales.map((item) => <option key={item} value={item}>{messages.languages[item]}</option>)}
            </select>
            <div className="relative">
              <button
                onClick={() => { setAccountOpen((open) => !open); setThemesOpen(false); }}
                aria-label={messages.accountMenu}
                aria-expanded={accountOpen}
                className={cn("grid h-10 w-10 place-items-center rounded-xl transition", accountOpen ? "bg-bg text-ink" : "text-muted hover:bg-bg hover:text-ink")}
              >
                <UserRound size={19} />
              </button>
              {accountOpen && (
                <div className="absolute right-0 top-12 z-50 w-64 rounded-2xl border border-line bg-surface p-2 shadow-[var(--shadow)]">
                  <div className="border-b border-line px-3 py-3">
                    <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">{user.email}</p>
                    <span className="mt-2 inline-flex rounded-full bg-bg px-2.5 py-1 text-xs font-medium text-muted">{messages.role[user.role]}</span>
                  </div>
                  <Link href="/account" className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-muted transition hover:bg-bg hover:text-ink">
                    <Settings2 size={17} /> {messages.myAccount}
                  </Link>
                  <button onClick={logout} className="mt-1 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-danger transition hover:bg-bg">
                    <LogOut size={17} />
                    {messages.signOut}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {drawerOpen && (
        <div className="fixed inset-0 z-40">
          <button className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setDrawerOpen(false)} aria-label={messages.closeNavigation} />
          <aside className="absolute inset-y-0 left-0 flex w-[min(19rem,85vw)] flex-col border-r border-line bg-surface p-5 shadow-2xl">
            <div className="mb-8 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {brandLogo ? <Image src={brandLogo} alt="" width={144} height={40} unoptimized className="max-h-10 max-w-36 object-contain" /> : <span className="grid h-10 w-10 place-items-center rounded-2xl bg-brand text-lg font-bold text-brand-ink">{APP_NAME.slice(0, 1).toUpperCase()}</span>}
                <div>
                  <p className="text-lg font-semibold tracking-tight text-ink">{APP_NAME}</p>
                  <p className="text-xs text-muted">{APP_TAGLINE}</p>
                </div>
              </div>
              <button onClick={() => setDrawerOpen(false)} aria-label={messages.closeNavigation} className="grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-bg hover:text-ink"><X size={19} /></button>
            </div>
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted">{messages.navigation}</p>
            <nav className="flex flex-col gap-1">
              {links.map((link) => {
                const active = pathname === link.href;
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition",
                      active ? "bg-brand text-brand-ink shadow-[var(--shadow)]" : "text-muted hover:bg-bg hover:text-ink",
                    )}
                  >
                    <Icon size={18} />
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {update && (
        <div role="status" className="mx-auto mt-4 flex max-w-[1400px] flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm text-ink sm:mx-6 lg:mx-auto">
          <p>{messages.updateAvailable.replace("{version}", update.latestVersion).replace("{current}", update.currentVersion)}</p>
          <div className="flex items-center gap-4">
            <a href={update.releaseUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand underline underline-offset-2">{messages.viewRelease}</a>
            {updaterAvailable && (!updateStatus || ["idle", "succeeded", "failed"].includes(updateStatus.phase)) && <button onClick={startUpdate} className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 font-semibold text-brand-ink"><RefreshCw size={15} />{messages.installUpdate}</button>}
          </div>
          {updateStatus && !["idle", "succeeded"].includes(updateStatus.phase) && <p className="basis-full">{messages.updatePhase}: {updateStatus.message || updateStatus.phase}{updateError ? ` — ${messages.updateServiceUnavailable}` : ""}</p>}
          {updateStatus?.phase === "succeeded" && <p className="basis-full">{messages.updateDone}</p>}
          {!updaterAvailable && <p className="basis-full text-muted">{messages.updaterUnavailable}</p>}
        </div>
      )}
      <main className="mx-auto min-w-0 max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</main>
    </div>
  );
}
