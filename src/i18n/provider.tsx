"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, getMessages, normalizeLocale, LOCALE_COOKIE, type Locale, type Messages } from "@/i18n/messages";

type I18nValue = { locale: Locale; messages: Messages; setLocale: (locale: Locale) => void };
const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children, initialLocale }: { children: React.ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? DEFAULT_LOCALE);
  useEffect(() => {
    const saved = normalizeLocale(localStorage.getItem("ora-locale"));
    const browser = typeof navigator === "undefined" ? undefined : navigator.languages.map(normalizeLocale).find(Boolean) ?? normalizeLocale(navigator.language);
    const initial = initialLocale ?? saved ?? browser ?? DEFAULT_LOCALE;
    persistLocale(initial);
    // Initial locale selection is synchronized from browser preferences after hydration.
    let active = true;
    const timer = window.setTimeout(() => { if (active) setLocaleState(initial); }, 0);
    persistLocale(initial);
    return () => { active = false; window.clearTimeout(timer); };
  }, [initialLocale]);
  const setLocale = (next: Locale) => {
    setLocaleState(next);
    persistLocale(next);
  };
  const value = useMemo(() => ({ locale, messages: getMessages(locale), setLocale }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

function persistLocale(locale: Locale) {
  localStorage.setItem(LOCALE_COOKIE, locale);
  document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
  document.documentElement.lang = locale;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within I18nProvider");
  return value;
}
