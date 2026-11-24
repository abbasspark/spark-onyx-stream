-- CreateEnum
CREATE TYPE "AudioSource" AS ENUM ('EMBEDDED', 'UPLOADED');

-- CreateEnum
CREATE TYPE "AudioTrackStatus" AS ENUM ('PROCESSING', 'READY', 'FAILED');

-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'AUDIO';

-- AlterTable
ALTER TABLE "audio_tracks" ADD COLUMN     "error" TEXT,
ADD COLUMN     "sizeBytes" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "source" "AudioSource" NOT NULL DEFAULT 'EMBEDDED',
ADD COLUMN     "sourceFilename" TEXT,
ADD COLUMN     "sourcePath" TEXT,
ADD COLUMN     "status" "AudioTrackStatus" NOT NULL DEFAULT 'READY',
ADD COLUMN     "streamIndex" INTEGER,
ALTER COLUMN "playlistPath" DROP NOT NULL;

-- AlterTable
ALTER TABLE "viewer_profiles" ADD COLUMN     "audioLanguage" TEXT,
ADD COLUMN     "subtitleLanguage" TEXT;

