-- CreateTable
CREATE TABLE "origin_traffic_hours" (
    "hour" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL DEFAULT 0,
    "requests" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "origin_traffic_hours_pkey" PRIMARY KEY ("hour","kind")
);

