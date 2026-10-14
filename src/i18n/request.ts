import { cookies } from "next/headers";
import { DEFAULT_LOCALE, getMessages, normalizeLocale, LOCALE_COOKIE, type Messages } from "./messages";

/** Resolve the persisted interface language. Invalid or missing values fall back to English. */
export async function requestMessages(): Promise<Messages> {
  const store = await cookies();
  return getMessages(normalizeLocale(store.get(LOCALE_COOKIE)?.value) ?? DEFAULT_LOCALE);
}
