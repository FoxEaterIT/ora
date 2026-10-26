"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Clock3, DatabaseBackup, FolderKanban, LayoutDashboard, LogOut, Moon, Palette, Sun, Timer, UserRound, Users, UsersRound, Settings2, RefreshCw, Trash2, Menu, X, DownloadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Modal } from "@/components/ui";
import { APP_NAME, APP_TAGLINE, AVAILABLE_THEMES, EFFECTIVE_DEFAULT_THEME, appLogoForTheme } from "@/lib/app-config";
import { locales } from "@/i18n/messages";
import { useI18n } from "@/i18n/provider";

export type SessionUser = { id: string; firstName: string; lastName: string; name: string; email: string; role: "OWNER" | "ADMIN" | "USER" };

const THEMES = AVAILABLE_THEMES;
type NavigationLink = { href: string; label: string; icon: typeof Timer };

function ShellLink({ link, active }: { link: NavigationLink; active: boolean }) {
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "ora-nav-link flex min-h-12 items-center gap-3 rounded-full px-2 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25",
        active ? "bg-brand/10 font-semibold text-ink" : "text-muted hover:bg-[var(--surface-sunken)] hover:text-ink",
      )}
    >
      <span className="ora-icon-disc"><Icon size={18} strokeWidth={2.4} aria-hidden="true" /></span>
      {link.label}
    </Link>
  );
}

export function Shell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const desktopMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("desktop");
  const { locale, messages, setLocale } = useI18n();
  const manager = user.role !== "USER";
  const owner = user.role === "OWNER";
  const [theme, setTheme] = useState(EFFECTIVE_DEFAULT_THEME);
  const [lightTheme, setLightTheme] = useState(EFFECTIVE_DEFAULT_THEME);
  const [accountOpen, setAccountOpen] = useState(false);
  const [themesOpen, setThemesOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [narrowViewport, setNarrowViewport] = useState(false);
  const navigationTriggerRef = useRef<HTMLButtonElement>(null);
  const navigationPanelRef = useRef<HTMLElement>(null);
  const [update, setUpdate] = useState<{ currentVersion: string; latestVersion: string; releaseUrl: string } | null>(null);
  const [desktopRelease, setDesktopRelease] = useState<{ version: string; releaseUrl: string; body: string; assets: { name: string; url: string }[] } | null>(null);
  const [updateStatus, setUpdateStatus] = useState<{ phase: string; message: string; targetVersion: string } | null>(null);
  const [updaterAvailable, setUpdaterAvailable] = useState(false);
  const [updateError, setUpdateError] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const brandLogo = appLogoForTheme(theme);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const updateViewport = () => setNarrowViewport(media.matches);
    updateViewport();
    media.addEventListener("change", updateViewport);
    return () => media.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    const allowedThemes: string[] = THEMES.map((item) => item.value);
    const storedTheme = localStorage.getItem("ora-theme");
    const storedLightTheme = localStorage.getItem("ora-light-theme");
    const saved = storedTheme === "dark" ? "dark" : allowedThemes.includes(storedTheme ?? "") ? storedTheme! : EFFECTIVE_DEFAULT_THEME;
    const savedLight = allowedThemes.includes(storedLightTheme ?? "")
      ? storedLightTheme!
      : saved === "dark" ? EFFECTIVE_DEFAULT_THEME : saved;
    window.setTimeout(() => {
      setLightTheme(savedLight);
      setTheme(saved);
    }, 0);
    document.documentElement.dataset.theme = saved;
    localStorage.setItem("ora-theme", saved);
    localStorage.setItem("ora-light-theme", savedLight);
  }, []);

  useEffect(() => {
    if (desktopMode) return;
    let active = true;
    fetch("/api/desktop-release", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (active && data?.version && Array.isArray(data.assets)) setDesktopRelease(data); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [desktopMode]);

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
    let failures = 0;
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      try {
        const response = await fetch("/api/update", { cache: "no-store" });
        if (!response.ok) throw new Error("Updater status request failed");
        const data = await response.json();
        if (!active) return;
        failures = 0;
        setUpdaterAvailable(data.available === true);
        if (data.status) {
          setUpdateStatus(data.status);
          setUpdating(!["idle", "succeeded", "failed"].includes(data.status.phase));
          if (["succeeded", "failed"].includes(data.status.phase)) setUpdateError(false);
        }
      } catch {
        if (!active) return;
        failures += 1;
        if (updating) setUpdateError(true);
        if (failures >= 3) {
          stopped = true;
          window.clearInterval(interval);
        }
      }
    };
    void poll();
    const interval = window.setInterval(() => { void poll(); }, 3000);
    return () => { active = false; window.clearInterval(interval); };
  }, [manager, updating]);

  async function startUpdate() {
    setConfirmUpdate(false);
    setUpdateError(false);
    try {
      const response = await fetch("/api/update", { method: "POST" });
      if (!response.ok) setUpdateError(true);
      else setUpdateStatus({ phase: "queued", message: "", targetVersion: update?.latestVersion ?? "" });
    } catch { setUpdateError(true); }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAccountOpen(false);
      setThemesOpen(false);
      setNavigationOpen(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (!navigationOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNavigationOpen(false);
        navigationTriggerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    navigationPanelRef.current?.querySelector<HTMLAnchorElement>("a")?.focus();
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigationOpen]);

  function toggleTheme() {
    const next = theme === "dark" ? lightTheme : "dark";
    setTheme(next);
    window.setTimeout(() => { document.documentElement.dataset.theme = next; }, 0);
    localStorage.setItem("ora-theme", next);
    if (next !== "dark") localStorage.setItem("ora-light-theme", next);
    setThemesOpen(false);
  }

  function selectLightTheme(next: string) {
    setTheme(next);
    setLightTheme(next);
    window.setTimeout(() => { document.documentElement.dataset.theme = next; }, 0);
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
          ...(owner ? [{ href: "/manage/backups", label: messages.backups, icon: DatabaseBackup }, { href: "/manage/uninstall", label: messages.uninstallPage.title, icon: Trash2 }] : []),
        ]
      : []),
  ];

  return (
    <div className="min-h-screen md:grid md:grid-cols-[17.5rem_minmax(0,1fr)]">
      <aside ref={navigationPanelRef} id="ora-navigation-panel" aria-label={messages.navigation} className={cn("ora-glass flex flex-col overflow-y-auto border-b p-4 md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r", narrowViewport ? (navigationOpen ? "block min-h-screen" : "hidden") : "")}>
        <div className="mb-4 flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {brandLogo ? <Image src={brandLogo} alt="" width={48} height={48} unoptimized className="h-12 w-12 shrink-0 object-contain" /> : <span className="ora-icon-disc shrink-0 text-lg font-bold">{APP_NAME.slice(0, 1).toUpperCase()}</span>}
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold tracking-tight text-ink">{APP_NAME}</p>
              <p className="text-xs leading-snug text-muted">{APP_TAGLINE}</p>
            </div>
          </div>
          {narrowViewport && <button type="button" onClick={() => { setNavigationOpen(false); window.setTimeout(() => navigationTriggerRef.current?.focus(), 0); }} aria-label={messages.closeNavigation} className="ora-icon-disc ml-auto shrink-0 md:hidden"><X size={19} aria-hidden="true" /></button>}
        </div>
        <nav aria-label={messages.navigation} className="flex flex-col gap-1">{links.map((link) => <ShellLink key={link.href} link={link} active={pathname === link.href} />)}</nav>
        {desktopRelease && !desktopMode && <div className="mt-auto border-t border-line/70 pt-3"><ShellLink link={{ href: "/manage/desktop-release", label: messages.newVersion, icon: DownloadCloud }} active={pathname === "/manage/desktop-release"} /></div>}
      </aside>
      <div className="min-w-0">
      {!(narrowViewport && navigationOpen) && <>
      <header className="ora-glass sticky top-0 z-30 h-16 border-x-0 border-t-0">
        <div className="mx-auto flex h-full max-w-[1400px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center justify-start gap-1">
            {narrowViewport && !navigationOpen && <button ref={navigationTriggerRef} type="button" onClick={() => setNavigationOpen(true)} aria-label={messages.openNavigation} aria-controls="ora-navigation-panel" aria-expanded={false} className="ora-icon-disc md:hidden">
              <Menu size={19} aria-hidden="true" />
            </button>}
          </div>
          <div className="flex items-center justify-end gap-1">
            {theme !== "dark" && (
              <div className="relative">
                <button
                  onClick={() => { setThemesOpen((open) => !open); setAccountOpen(false); }}
                  aria-label={messages.theme}
                  aria-expanded={themesOpen}
                  title={`${messages.themeLabel}: ${THEMES.find((item) => item.value === lightTheme)?.label || THEMES[0].label}`}
                  className="ora-icon-disc text-muted transition hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
                >
                  <Palette size={19} />
                </button>
                {themesOpen && (
                  <div className="ora-glass absolute right-0 top-12 z-50 w-52 rounded-3xl !bg-surface-raised p-2 shadow-2xl">
                    <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-muted">{messages.lightTheme}</p>
                    {THEMES.map((item) => (
                      <button
                        key={item.value}
                        onClick={() => selectLightTheme(item.value)}
                        className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25", lightTheme === item.value ? "font-semibold text-ink" : "text-muted")}
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
              className="ora-icon-disc text-muted transition hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"
            >
              {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <label className="sr-only" htmlFor="ora-language">{messages.language}</label>
            <select id="ora-language" aria-label={messages.language} value={locale} onChange={(event) => setLocale(event.target.value as typeof locale)} className="ora-select max-w-20 rounded-full border border-line bg-surface/80 px-3 py-2 text-xs text-ink shadow-sm backdrop-blur-md transition hover:border-brand/50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25 sm:max-w-28">
              {locales.map((item) => <option key={item} value={item}>{messages.languages[item]}</option>)}
            </select>
            <div className="relative">
              <button
                onClick={() => { setAccountOpen((open) => !open); setThemesOpen(false); }}
                aria-label={messages.accountMenu}
                aria-expanded={accountOpen}
                className={cn("ora-icon-disc transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25", accountOpen ? "text-ink" : "text-muted hover:text-ink")}
              >
                <UserRound size={19} />
              </button>
              {accountOpen && (
                <div className="ora-glass absolute right-0 top-12 z-50 w-64 rounded-3xl !bg-surface-raised p-2 shadow-2xl">
                  <div className="border-b border-line px-3 py-3">
                    <p className="truncate text-sm font-semibold text-ink">{user.name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">{user.email}</p>
                    <span className="mt-2 inline-flex rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-xs font-medium text-muted">{messages.role[user.role]}</span>
                  </div>
                  <Link href="/account" className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-muted transition hover:bg-[var(--surface-sunken)] hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25">
                    <Settings2 size={17} /> {messages.myAccount}
                  </Link>
                  <button onClick={logout} className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm text-danger transition hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25">
                    <LogOut size={17} />
                    {messages.signOut}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>


      {update && (
        <div role="status" className="ora-glass mx-4 mt-4 flex max-w-[1400px] flex-wrap items-center justify-between gap-3 rounded-3xl bg-brand/10 px-4 py-3 text-sm text-ink sm:mx-6">
          <p>{messages.updateAvailable.replace("{version}", update.latestVersion).replace("{current}", update.currentVersion)}</p>
          <div className="flex items-center gap-4">
            <a href={update.releaseUrl} target="_blank" rel="noreferrer" className="font-semibold text-brand underline underline-offset-2">{messages.viewRelease}</a>
            {updaterAvailable && (!updateStatus || ["idle", "succeeded", "failed"].includes(updateStatus.phase)) && <button onClick={() => setConfirmUpdate(true)} className="inline-flex items-center gap-2 rounded-full bg-brand px-3 py-2 font-semibold text-brand-ink hover:bg-[var(--brand-strong)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/25"><RefreshCw size={15} />{messages.installUpdate}</button>}
          </div>
          {updateStatus && !["idle", "succeeded"].includes(updateStatus.phase) && <p role="status" aria-atomic="true" className="basis-full">{messages.updatePhase}: {updateStatus.message || updateStatus.phase}{updateError ? ` — ${messages.updateServiceUnavailable}` : ""}</p>}
          {updateStatus?.phase === "succeeded" && <p role="status" aria-atomic="true" className="basis-full">{messages.updateDone}</p>}
          {!updaterAvailable && <p className="basis-full text-muted">{messages.updaterUnavailable}</p>}
        </div>
      )}
      {confirmUpdate ? <Modal title={messages.installUpdate} onClose={() => setConfirmUpdate(false)}><p>{messages.updateConfirm}</p><div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setConfirmUpdate(false)}>{messages.app.cancel}</Button><Button onClick={() => void startUpdate()}>{messages.installUpdate}</Button></div></Modal> : null}
      <main className="mx-auto min-w-0 max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</main>
      </>}
      </div>
    </div>
  );
}
