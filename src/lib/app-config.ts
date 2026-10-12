export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Ora";
export const APP_TAGLINE = process.env.NEXT_PUBLIC_APP_TAGLINE?.trim() || "Time tracking";
export const APP_DESCRIPTION = process.env.NEXT_PUBLIC_APP_DESCRIPTION?.trim() || `Traccia ore di progetti, team e persone con ${APP_NAME}.`;
export const APP_DEFAULT_THEME = process.env.NEXT_PUBLIC_DEFAULT_THEME?.trim() || "ora-default";
function customLogoPath(value: string | undefined) {
  const path = value?.trim() || "";
  // Custom branding assets must be served from public/custom; reject URLs and other public paths.
  return /^\/custom\/[\w./-]+$/.test(path) && !path.split("/").includes("..") ? path : "";
}

export const APP_LOGO_LIGHT = customLogoPath(process.env.NEXT_PUBLIC_APP_LOGO_LIGHT);
export const APP_LOGO_DARK = customLogoPath(process.env.NEXT_PUBLIC_APP_LOGO_DARK);
export const PROJECT_COLORS = (process.env.NEXT_PUBLIC_PROJECT_COLORS || "#14b8a6,#5b5bd6,#f97316,#e11d48,#0ea5e9,#84cc16,#a855f7").split(",").map((color) => color.trim()).filter(Boolean);
export const TEAM_COLORS = (process.env.NEXT_PUBLIC_TEAM_COLORS || "#6366f1,#0ea5e9,#f97316,#14b8a6,#e11d48,#a855f7").split(",").map((color) => color.trim()).filter(Boolean);

export const THEMES = [
  { value: "ora-default", label: process.env.NEXT_PUBLIC_THEME_DEFAULT_LABEL?.trim() || "Ora - default", color: process.env.NEXT_PUBLIC_THEME_DEFAULT_COLOR?.trim() || "#5b5bd6" },
  { value: "ora-blue", label: process.env.NEXT_PUBLIC_THEME_BLUE_LABEL?.trim() || "Ora blu", color: process.env.NEXT_PUBLIC_THEME_BLUE_COLOR?.trim() || "#2878c7" },
  { value: "ora-green", label: process.env.NEXT_PUBLIC_THEME_GREEN_LABEL?.trim() || "Ora verde", color: process.env.NEXT_PUBLIC_THEME_GREEN_COLOR?.trim() || "#318454" },
  { value: "ora-purple", label: process.env.NEXT_PUBLIC_THEME_PURPLE_LABEL?.trim() || "Ora viola", color: process.env.NEXT_PUBLIC_THEME_PURPLE_COLOR?.trim() || "#8051b5" },
  { value: "ora-orange", label: process.env.NEXT_PUBLIC_THEME_ORANGE_LABEL?.trim() || "Ora arancione", color: process.env.NEXT_PUBLIC_THEME_ORANGE_COLOR?.trim() || "#c96c2c" },
] as const;

const configuredThemes = process.env.NEXT_PUBLIC_ORA_THEMES?.split(",").map((theme) => theme.trim()).filter(Boolean);
export const AVAILABLE_THEMES = THEMES.filter(
  (theme) => theme.value === "ora-default" || !configuredThemes?.length || configuredThemes.includes(theme.value),
);
export const EFFECTIVE_DEFAULT_THEME = AVAILABLE_THEMES.some((theme) => theme.value === APP_DEFAULT_THEME)
  ? APP_DEFAULT_THEME
  : "ora-default";

export function appLogoForTheme(theme: string) {
  if (theme === "dark") return APP_LOGO_DARK || APP_LOGO_LIGHT;
  return APP_LOGO_LIGHT || APP_LOGO_DARK;
}
