export function canCreateProject(role: string) {
  return role === "OWNER" || role === "ADMIN" || role === "USER";
}

export function canManageProjectMembers(role: string) {
  return role === "OWNER" || role === "ADMIN" || role === "USER";
}

export function canAssignProjectMembers(role: string) {
  return canManageProjectMembers(role);
}

export function canDeleteProject(role: string, entryCount: number) {
  return (role === "OWNER" || role === "ADMIN") && entryCount === 0;
}
