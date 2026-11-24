-- AlterTable
ALTER TABLE "channels" ADD COLUMN     "minAge" SMALLINT;

-- AlterTable
ALTER TABLE "titles" ADD COLUMN     "minAge" SMALLINT;

-- AlterTable
ALTER TABLE "viewer_profiles" ADD COLUMN     "isKids" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxAge" SMALLINT,
ADD COLUMN     "pinFailed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pinHash" TEXT,
ADD COLUMN     "pinLockedUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "viewer_sessions" ADD COLUMN     "profileLocked" BOOLEAN NOT NULL DEFAULT false;


-- Titles that have a rating get the age it stands for, so profiles with an
-- age limit have something to see from the first day. The same reading as
-- ageFromRating() in the API. What it cannot read stays empty.
UPDATE "titles" SET "minAge" = CASE
  WHEN upper(btrim("ageRating")) IN ('G', 'U', 'TV-Y', 'TV-G', 'E', 'ALL', 'L', 'TP', 'T', 'A', 'AL', 'FSK 0', 'FSK0') THEN 0
  WHEN upper(btrim("ageRating")) IN ('PG', 'TV-PG') THEN 8
  WHEN upper(btrim("ageRating")) IN ('R', 'TV-MA', 'M', 'MA') THEN 17
  WHEN upper(btrim("ageRating")) IN ('X', 'XXX', 'AO') THEN 18
  WHEN "ageRating" ~ '\d' AND substring("ageRating" from '(\d{1,2})')::int <= 21
    THEN substring("ageRating" from '(\d{1,2})')::int
  ELSE NULL
END
WHERE "ageRating" IS NOT NULL;
