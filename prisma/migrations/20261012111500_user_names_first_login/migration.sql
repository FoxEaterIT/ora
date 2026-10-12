-- Preserve existing users' names while splitting them into first and last names.
PRAGMA defer_foreign_keys=ON;

CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "passwordHash" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

INSERT INTO "new_User" ("id", "email", "firstName", "lastName", "passwordHash", "role", "createdAt", "updatedAt")
SELECT
    "id",
    "email",
    CASE WHEN instr(trim("name"), ' ') = 0 THEN trim("name") ELSE substr(trim("name"), 1, instr(trim("name"), ' ') - 1) END,
    CASE WHEN instr(trim("name"), ' ') = 0 THEN '' ELSE trim(substr(trim("name"), instr(trim("name"), ' ') + 1)) END,
    "passwordHash",
    "role",
    "createdAt",
    "updatedAt"
FROM "User";

DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
