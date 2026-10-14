CREATE UNIQUE INDEX "TimeEntry_one_running_per_user_key"
ON "TimeEntry"("userId")
WHERE "end" IS NULL;
