import {
  APP_DESCRIPTION,
  APP_LOGO_DARK,
  APP_LOGO_LIGHT,
  APP_NAME,
  APP_TAGLINE,
  AVAILABLE_THEMES,
  EFFECTIVE_DEFAULT_THEME,
  PROJECT_COLORS,
  TEAM_COLORS,
} from "@/lib/app-config";
import { desktopForbidden, desktopUserForAllowedRoute, desktopJson, runWithDesktopRequest } from "@/lib/desktop-auth";

/** Public branding and theme settings only. Server secrets are not part of this payload. */
export async function GET(request: Request) {
  return runWithDesktopRequest(request, async () => {
  const desktop = await desktopUserForAllowedRoute(request.url);
  if (new URL(request.url).searchParams.size > 0) return desktopForbidden();
  if (!desktop.desktop || !desktop.user) return desktopForbidden();
  return desktopJson({
    user: { firstName: desktop.user.firstName, email: desktop.user.email, name: `${desktop.user.firstName} ${desktop.user.lastName}`.trim() },
    config: {
      name: APP_NAME,
      tagline: APP_TAGLINE,
      description: APP_DESCRIPTION,
      logoLight: APP_LOGO_LIGHT,
      logoDark: APP_LOGO_DARK,
      defaultTheme: EFFECTIVE_DEFAULT_THEME,
      themes: AVAILABLE_THEMES.map((theme) => ({ value: theme.value, label: theme.label, color: theme.color })),
      projectColors: PROJECT_COLORS,
      teamColors: TEAM_COLORS,
    },
  });
  });
}
