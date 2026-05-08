-- CreateTable
CREATE TABLE "foundation_jobs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobKey" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INTAKE',
    "dueDate" DATETIME,
    "depositPaid" BOOLEAN NOT NULL DEFAULT false,
    "printMethod" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "foundation_jobs_jobKey_key" ON "foundation_jobs"("jobKey");
CREATE INDEX "foundation_jobs_status_idx" ON "foundation_jobs"("status");
CREATE INDEX "foundation_jobs_jobKey_idx" ON "foundation_jobs"("jobKey");

CREATE TABLE "foundation_line_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "color" TEXT,
    "size" TEXT,
    "quantity" INTEGER NOT NULL,
    CONSTRAINT "foundation_line_items_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "foundation_jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "foundation_line_items_jobId_idx" ON "foundation_line_items"("jobId");

CREATE TABLE "foundation_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    CONSTRAINT "foundation_tasks_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "foundation_jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "foundation_tasks_jobId_idx" ON "foundation_tasks"("jobId");

CREATE TABLE "foundation_art_files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    CONSTRAINT "foundation_art_files_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "foundation_jobs" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "foundation_art_files_jobId_idx" ON "foundation_art_files"("jobId");

CREATE TABLE "foundation_event_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "foundation_event_logs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "foundation_jobs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "foundation_event_logs_jobId_idx" ON "foundation_event_logs"("jobId");
CREATE INDEX "foundation_event_logs_createdAt_idx" ON "foundation_event_logs"("createdAt");
