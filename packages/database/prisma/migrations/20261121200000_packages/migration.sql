-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "includesAll" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "packages" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "title_packages" (
    "titleId" UUID NOT NULL,
    "packageId" UUID NOT NULL,

    CONSTRAINT "title_packages_pkey" PRIMARY KEY ("titleId","packageId")
);

-- CreateTable
CREATE TABLE "plan_packages" (
    "planId" UUID NOT NULL,
    "packageId" UUID NOT NULL,

    CONSTRAINT "plan_packages_pkey" PRIMARY KEY ("planId","packageId")
);

-- CreateIndex
CREATE UNIQUE INDEX "packages_name_key" ON "packages"("name");

-- CreateIndex
CREATE INDEX "packages_position_idx" ON "packages"("position");

-- CreateIndex
CREATE INDEX "title_packages_packageId_idx" ON "title_packages"("packageId");

-- CreateIndex
CREATE INDEX "plan_packages_packageId_idx" ON "plan_packages"("packageId");

-- AddForeignKey
ALTER TABLE "title_packages" ADD CONSTRAINT "title_packages_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "titles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "title_packages" ADD CONSTRAINT "title_packages_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_packages" ADD CONSTRAINT "plan_packages_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_packages" ADD CONSTRAINT "plan_packages_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

