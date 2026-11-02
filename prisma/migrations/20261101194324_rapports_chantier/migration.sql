-- CreateEnum
CREATE TYPE "NcStatus" AS ENUM ('OUVERT', 'EN_COURS', 'LEVE');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "company" TEXT,
ADD COLUMN     "overtimeAfter" INTEGER NOT NULL DEFAULT 44;

-- CreateTable
CREATE TABLE "DailyReport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "site" TEXT NOT NULL,
    "zoneLabel" TEXT,
    "leaderName" TEXT,
    "weather" TEXT,
    "issuesText" TEXT,
    "materialText" TEXT,
    "safetyText" TEXT,
    "tomorrowText" TEXT,
    "leaderVisaBy" TEXT,
    "leaderVisaAt" TIMESTAMP(3),
    "managerVisaBy" TEXT,
    "managerVisaAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReportWorker" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "hours" DOUBLE PRECISION,
    "note" TEXT,

    CONSTRAINT "DailyReportWorker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReportSystem" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "previousPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "todayPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "work" TEXT,

    CONSTRAINT "DailyReportSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostProgress" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "building" TEXT NOT NULL DEFAULT '',
    "post" TEXT NOT NULL,
    "system" TEXT,
    "percent" DOUBLE PRECISION NOT NULL,
    "note" TEXT,

    CONSTRAINT "PostProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimesheetEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "site" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL,
    "role" TEXT,
    "h1" DOUBLE PRECISION,
    "h2" DOUBLE PRECISION,
    "h3" DOUBLE PRECISION,
    "h4" DOUBLE PRECISION,
    "h5" DOUBLE PRECISION,
    "h6" DOUBLE PRECISION,
    "note" TEXT,

    CONSTRAINT "TimesheetEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistPoint" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "system" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChecklistPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistResult" (
    "id" TEXT NOT NULL,
    "pointId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT '',
    "result" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "note" TEXT,
    "byName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NonConformity" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "zoneLabel" TEXT,
    "system" TEXT,
    "description" TEXT NOT NULL,
    "action" TEXT,
    "responsible" TEXT,
    "status" "NcStatus" NOT NULL DEFAULT 'OUVERT',
    "source" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NonConformity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialRequest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "site" TEXT,
    "status" TEXT NOT NULL DEFAULT 'BROUILLON',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialLine" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "designation" TEXT NOT NULL,
    "reference" TEXT,
    "unit" TEXT,
    "quantity" DOUBLE PRECISION,
    "wantedDate" TIMESTAMP(3),
    "system" TEXT,
    "note" TEXT,

    CONSTRAINT "MaterialLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "workType" TEXT NOT NULL,
    "zoneLabel" TEXT,
    "system" TEXT,
    "work" TEXT NOT NULL,
    "percent" DOUBLE PRECISION,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeriodLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyReport_projectId_date_site_key" ON "DailyReport"("projectId", "date", "site");

-- CreateIndex
CREATE INDEX "PostProgress_projectId_date_idx" ON "PostProgress"("projectId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PostProgress_projectId_date_building_post_key" ON "PostProgress"("projectId", "date", "building", "post");

-- CreateIndex
CREATE INDEX "TimesheetEntry_projectId_weekStart_idx" ON "TimesheetEntry"("projectId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistResult_pointId_scope_key" ON "ChecklistResult"("pointId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "NonConformity_projectId_number_key" ON "NonConformity"("projectId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialRequest_projectId_number_key" ON "MaterialRequest"("projectId", "number");

-- CreateIndex
CREATE INDEX "PeriodLog_projectId_startDate_idx" ON "PeriodLog"("projectId", "startDate");

-- AddForeignKey
ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReportWorker" ADD CONSTRAINT "DailyReportWorker_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReportSystem" ADD CONSTRAINT "DailyReportSystem_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DailyReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostProgress" ADD CONSTRAINT "PostProgress_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetEntry" ADD CONSTRAINT "TimesheetEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistPoint" ADD CONSTRAINT "ChecklistPoint_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistResult" ADD CONSTRAINT "ChecklistResult_pointId_fkey" FOREIGN KEY ("pointId") REFERENCES "ChecklistPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NonConformity" ADD CONSTRAINT "NonConformity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialLine" ADD CONSTRAINT "MaterialLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "MaterialRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeriodLog" ADD CONSTRAINT "PeriodLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
