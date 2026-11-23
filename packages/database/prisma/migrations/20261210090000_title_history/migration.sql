-- CreateTable
CREATE TABLE "title_revisions" (
    "id" UUID NOT NULL,
    "titleId" UUID NOT NULL,
    "adminId" UUID,
    "action" TEXT NOT NULL,
    "changes" JSONB NOT NULL,
    "changeCount" INTEGER NOT NULL DEFAULT 0,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "title_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "title_revisions_titleId_createdAt_idx" ON "title_revisions"("titleId", "createdAt");

-- AddForeignKey
ALTER TABLE "title_revisions" ADD CONSTRAINT "title_revisions_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_revisions" ADD CONSTRAINT "title_revisions_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

