export function canDeleteEntry(actorId: string, entryOwnerId: string) {
  return actorId === entryOwnerId;
}
