ALTER TABLE "User" ADD COLUMN "deactivatedAt" DATETIME;

-- Preserve historical time entries if a User or Project is deleted through direct database access.
PRAGMA defer_foreign_keys=ON;

CREATE TABLE "new_TimeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "start" DATETIME NOT NULL,
    "end" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TimeEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_TimeEntry" ("id", "userId", "projectId", "description", "start", "end", "createdAt", "updatedAt")
SELECT "id", "userId", "projectId", "description", "start", "end", "createdAt", "updatedAt" FROM "TimeEntry";

DROP TABLE "TimeEntry";
ALTER TABLE "new_TimeEntry" RENAME TO "TimeEntry";

CREATE INDEX "TimeEntry_userId_start_idx" ON "TimeEntry"("userId", "start");
CREATE INDEX "TimeEntry_projectId_start_idx" ON "TimeEntry"("projectId", "start");

