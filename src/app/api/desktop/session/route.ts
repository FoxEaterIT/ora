import { desktopForbidden, desktopUserForAllowedRoute, desktopJson, runWithDesktopRequest } from "@/lib/desktop-auth";

/** Validates the current desktop session and returns only the public navigation profile. */
export async function GET(request: Request) {
  return runWithDesktopRequest(request, async () => {
  const desktop = await desktopUserForAllowedRoute(request.url);
  if (new URL(request.url).searchParams.size > 0) return desktopForbidden();
  if (!desktop.desktop || !desktop.user) return desktopForbidden();

  return desktopJson({
    user: {
      id: desktop.user.id,
      firstName: desktop.user.firstName,
      lastName: desktop.user.lastName,
      name: `${desktop.user.firstName} ${desktop.user.lastName}`.trim(),
      email: desktop.user.email,
      role: desktop.user.role,
    },
  });
  });
}
