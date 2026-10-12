import { DEFAULT_LOCALE, locales, messages } from "./messages";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key));
}

const reference = keys(messages[DEFAULT_LOCALE]).sort();
for (const locale of locales) {
  const actual = keys(messages[locale]).sort();
  if (JSON.stringify(actual) !== JSON.stringify(reference)) {
    throw new Error(`Translation keys differ for locale ${locale}`);
  }
}
console.log(`Translation dictionaries are complete for: ${locales.join(", ")}`);
