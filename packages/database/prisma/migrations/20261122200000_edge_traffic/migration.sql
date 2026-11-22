-- CreateTable
CREATE TABLE "edge_traffic_hours" (
    "edgeId" UUID NOT NULL,
    "hour" TIMESTAMP(3) NOT NULL,
    "bytes" BIGINT NOT NULL DEFAULT 0,
    "requests" BIGINT NOT NULL DEFAULT 0,
    "hits" BIGINT NOT NULL DEFAULT 0,
    "misses" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "edge_traffic_hours_pkey" PRIMARY KEY ("edgeId","hour")
);

-- CreateIndex
CREATE INDEX "edge_traffic_hours_hour_idx" ON "edge_traffic_hours"("hour");

-- AddForeignKey
ALTER TABLE "edge_traffic_hours" ADD CONSTRAINT "edge_traffic_hours_edgeId_fkey" FOREIGN KEY ("edgeId") REFERENCES "edge_servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

