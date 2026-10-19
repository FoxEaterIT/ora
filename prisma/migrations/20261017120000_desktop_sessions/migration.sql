-- Durable desktop sessions. Only the SHA-256 hash of the bearer token is stored.
CREATE TABLE "DesktopLoginAttempt" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "failures" INTEGER NOT NULL DEFAULT 0,
    "blockedUntil" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "DesktopSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "revokeReason" TEXT,
    CONSTRAINT "DesktopSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DesktopSession_tokenHash_key" ON "DesktopSession"("tokenHash");
CREATE INDEX "DesktopSession_userId_expiresAt_idx" ON "DesktopSession"("userId", "expiresAt");

-- One live desktop session per user. Revoked and expired rows do not count.
CREATE UNIQUE INDEX "DesktopSession_one_active_per_user"
ON "DesktopSession"("userId")
WHERE "revokedAt" IS NULL;
