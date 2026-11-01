-- AlterTable
ALTER TABLE "System" ADD COLUMN     "gridEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "leaderName" TEXT;

-- AlterTable
ALTER TABLE "WorkItem" ADD COLUMN     "crew" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'GRID',
ADD COLUMN     "responsible" TEXT;

-- AlterTable
ALTER TABLE "Zone" ADD COLUMN     "leaderName" TEXT,
ADD COLUMN     "mainLot" TEXT NOT NULL DEFAULT 'CFO/CFA',
ADD COLUMN     "note" TEXT,
ADD COLUMN     "plannedHeadcount" INTEGER;

-- CreateTable
CREATE TABLE "ZoneHeadcount" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "planned" INTEGER,
    "present" INTEGER NOT NULL,

    CONSTRAINT "ZoneHeadcount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ZoneHeadcount_zoneId_date_key" ON "ZoneHeadcount"("zoneId", "date");

-- AddForeignKey
ALTER TABLE "ZoneHeadcount" ADD CONSTRAINT "ZoneHeadcount_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;
