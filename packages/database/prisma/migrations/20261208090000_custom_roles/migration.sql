-- AlterEnum
ALTER TYPE "AdminRole" ADD VALUE 'CUSTOM';

-- AlterTable
ALTER TABLE "admin_users" ADD COLUMN     "customRoleId" UUID;

-- CreateTable
CREATE TABLE "admin_custom_roles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT 'slate',
    "permissions" TEXT[],
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_custom_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_custom_roles_name_key" ON "admin_custom_roles"("name");

-- CreateIndex
CREATE INDEX "admin_users_customRoleId_idx" ON "admin_users"("customRoleId");

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_customRoleId_fkey" FOREIGN KEY ("customRoleId") REFERENCES "admin_custom_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

