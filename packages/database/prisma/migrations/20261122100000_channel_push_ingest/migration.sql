-- CreateEnum
CREATE TYPE "ChannelIngest" AS ENUM ('PULL', 'PUSH');

-- AlterEnum
ALTER TYPE "ChannelStatus" ADD VALUE 'IDLE';

-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "ingest" "ChannelIngest" NOT NULL DEFAULT 'PULL',
ADD COLUMN     "streamKeyEncrypted" TEXT,
ADD COLUMN     "streamKeyHash" TEXT,
ALTER COLUMN "sourceEncrypted" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "channels_streamKeyHash_key" ON "channels"("streamKeyHash");

