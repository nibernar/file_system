-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" VARCHAR(255) NOT NULL,
    "project_id" VARCHAR(255),
    "filename" VARCHAR(255) NOT NULL,
    "original_name" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(255) NOT NULL,
    "size" BIGINT NOT NULL,
    "storage_key" VARCHAR(255) NOT NULL,
    "cdn_url" VARCHAR(255),
    "checksum_md5" VARCHAR(255) NOT NULL,
    "checksum_sha256" VARCHAR(255) NOT NULL,
    "virus_scan_status" VARCHAR(50) DEFAULT 'pending',
    "processing_status" VARCHAR(50) DEFAULT 'pending',
    "version_count" INTEGER DEFAULT 1,
    "metadata" JSONB,
    "tags" TEXT[],
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "files_storage_key_key" ON "files"("storage_key");

-- CreateIndex
CREATE INDEX "idx_files_project_id" ON "files"("project_id");

-- CreateIndex
CREATE INDEX "idx_files_user_id" ON "files"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

