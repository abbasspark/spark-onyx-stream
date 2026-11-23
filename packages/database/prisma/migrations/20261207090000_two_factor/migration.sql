-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpLastStep" INTEGER;

-- CreateTable
CREATE TABLE "admin_recovery_codes" (
    "id" UUID NOT NULL,
    "adminId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_recovery_codes_codeHash_key" ON "admin_recovery_codes"("codeHash");

-- CreateIndex
CREATE INDEX "admin_recovery_codes_adminId_idx" ON "admin_recovery_codes"("adminId");

-- AddForeignKey
ALTER TABLE "admin_recovery_codes" ADD CONSTRAINT "admin_recovery_codes_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

