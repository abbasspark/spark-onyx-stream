-- CreateEnum
CREATE TYPE "TranslationJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "translation_jobs" (
    "id" UUID NOT NULL,
    "language" TEXT NOT NULL,
    "overwrite" BOOLEAN NOT NULL DEFAULT false,
    "status" "TranslationJobStatus" NOT NULL DEFAULT 'QUEUED',
    "titleIds" UUID[],
    "done" INTEGER NOT NULL DEFAULT 0,
    "translated" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "failures" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "translation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "translation_jobs_status_createdAt_idx" ON "translation_jobs"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "translation_jobs" ADD CONSTRAINT "translation_jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

