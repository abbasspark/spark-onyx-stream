-- Profiles: the people who share a viewer account, each with their own
-- watch history. Every existing account gets a main profile, and what the
-- account watched so far becomes the history of that profile.

-- CreateTable
CREATE TABLE "viewer_profiles" (
    "id" UUID NOT NULL,
    "viewerId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "viewer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "viewer_profiles_viewerId_idx" ON "viewer_profiles"("viewerId");

-- AddForeignKey
ALTER TABLE "viewer_profiles" ADD CONSTRAINT "viewer_profiles_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "viewers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A main profile for every account that exists, named like the account.
INSERT INTO "viewer_profiles" ("id", "viewerId", "name", "color", "isMain", "updatedAt")
SELECT gen_random_uuid(), "id", left("displayName", 40), 'amber', true, CURRENT_TIMESTAMP
FROM "viewers";

-- AlterTable
ALTER TABLE "viewer_sessions" ADD COLUMN     "profileId" UUID;

-- AddForeignKey
ALTER TABLE "viewer_sessions" ADD CONSTRAINT "viewer_sessions_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "viewer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: first without the rule that it is set, so existing rows can be filled.
ALTER TABLE "watch_progress" ADD COLUMN     "profileId" UUID;

UPDATE "watch_progress" AS w
SET "profileId" = p."id"
FROM "viewer_profiles" AS p
WHERE p."viewerId" = w."viewerId" AND p."isMain";

ALTER TABLE "watch_progress" ALTER COLUMN "profileId" SET NOT NULL;

-- DropIndex
DROP INDEX "watch_progress_viewerId_itemId_key";

-- CreateIndex
CREATE INDEX "watch_progress_profileId_watchedAt_idx" ON "watch_progress"("profileId", "watchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "watch_progress_profileId_itemId_key" ON "watch_progress"("profileId", "itemId");

-- AddForeignKey
ALTER TABLE "watch_progress" ADD CONSTRAINT "watch_progress_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "viewer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
