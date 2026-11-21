-- CreateEnum
CREATE TYPE "ViewerTokenKind" AS ENUM ('PASSWORD_RESET', 'EMAIL_VERIFICATION');

-- AlterTable
ALTER TABLE "viewers" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "viewer_tokens" (
    "id" UUID NOT NULL,
    "viewerId" UUID NOT NULL,
    "kind" "ViewerTokenKind" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "viewer_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "viewer_tokens_tokenHash_key" ON "viewer_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "viewer_tokens_viewerId_kind_idx" ON "viewer_tokens"("viewerId", "kind");

-- CreateIndex
CREATE INDEX "viewer_tokens_expiresAt_idx" ON "viewer_tokens"("expiresAt");

-- AddForeignKey
ALTER TABLE "viewer_tokens" ADD CONSTRAINT "viewer_tokens_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "viewers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
