"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, getMessages, normalizeLocale, type Locale, type Messages } from "@/i18n/messages";

type I18nValue = { locale: Locale; messages: Messages; setLocale: (locale: Locale) => void };
const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  useEffect(() => {
    const saved = normalizeLocale(localStorage.getItem("ora-locale"));
    const browser = typeof navigator === "undefined" ? undefined : navigator.languages.map(normalizeLocale).find(Boolean) ?? normalizeLocale(navigator.language);
    const initial = saved ?? browser ?? DEFAULT_LOCALE;
    setLocaleState(initial);
    localStorage.setItem("ora-locale", initial);
    document.documentElement.lang = initial;
  }, []);
  const setLocale = (next: Locale) => {
    setLocaleState(next);
    localStorage.setItem("ora-locale", next);
    document.documentElement.lang = next;
  };
  const value = useMemo(() => ({ locale, messages: getMessages(locale), setLocale }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within I18nProvider");
  return value;
}
