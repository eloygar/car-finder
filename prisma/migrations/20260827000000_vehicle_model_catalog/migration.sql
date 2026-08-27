-- Catalog of car models (brand + model) with relations to Listing and KnownIssue.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE "IssueCategory" AS ENUM ('mecanica', 'chapa', 'interior', 'otros');

CREATE TABLE "VehicleModel" (
  "id" TEXT NOT NULL,
  "brand" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VehicleModel_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VehicleModel_slug_idx" ON "VehicleModel"("slug");
CREATE UNIQUE INDEX "VehicleModel_brand_name_key" ON "VehicleModel"("brand", "name");
CREATE INDEX "VehicleModel_brand_idx" ON "VehicleModel"("brand");

-- Backfill the catalog from every distinct brand+model already present in the data.
INSERT INTO "VehicleModel" ("id", "brand", "name", "slug")
SELECT gen_random_uuid(), "brand", "model", lower(regexp_replace("brand" || '-' || "model", '[^a-zA-Z0-9]+', '-', 'g'))
FROM "Listing"
WHERE "brand" IS NOT NULL AND "model" IS NOT NULL
GROUP BY "brand", "model"
ON CONFLICT ("brand", "name") DO NOTHING;

INSERT INTO "VehicleModel" ("id", "brand", "name", "slug")
SELECT gen_random_uuid(), "brand", "model", lower(regexp_replace("brand" || '-' || "model", '[^a-zA-Z0-9]+', '-', 'g'))
FROM "KnownIssue"
WHERE "brand" IS NOT NULL AND "model" IS NOT NULL
GROUP BY "brand", "model"
ON CONFLICT ("brand", "name") DO NOTHING;

-- KnownIssue: relate to VehicleModel, add category and a content hash for deduplication.
ALTER TABLE "KnownIssue" ADD COLUMN "vehicleModelId" TEXT;
ALTER TABLE "KnownIssue" ADD COLUMN "category" "IssueCategory" NOT NULL DEFAULT 'otros';
ALTER TABLE "KnownIssue" ADD COLUMN "contentHash" TEXT;
ALTER TABLE "KnownIssue" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "KnownIssue" ki
SET "vehicleModelId" = vm."id",
    "contentHash" = encode(
      sha256(("issueDescription" || '|' || coalesce("yearFrom"::text, '') || '|' || coalesce("yearTo"::text, '') || '|' || coalesce("source", ''))::bytea),
      'hex'
    )
FROM "VehicleModel" vm
WHERE vm."brand" = ki."brand" AND vm."name" = ki."model" AND ki."vehicleModelId" IS NULL;

ALTER TABLE "KnownIssue" ALTER COLUMN "vehicleModelId" SET NOT NULL;
ALTER TABLE "KnownIssue" ALTER COLUMN "contentHash" SET NOT NULL;

ALTER TABLE "KnownIssue" ADD CONSTRAINT "KnownIssue_vehicleModelId_fkey"
  FOREIGN KEY ("vehicleModelId") REFERENCES "VehicleModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "KnownIssue_vehicleModelId_contentHash_key"
  ON "KnownIssue"("vehicleModelId", "contentHash");

-- Listing: optional relation to the model catalog.
ALTER TABLE "Listing" ADD COLUMN "vehicleModelId" TEXT;
UPDATE "Listing" l
SET "vehicleModelId" = vm."id"
FROM "VehicleModel" vm
WHERE vm."brand" = l."brand" AND vm."name" = l."model" AND l."vehicleModelId" IS NULL;

CREATE INDEX "Listing_vehicleModelId_idx" ON "Listing"("vehicleModelId");
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_vehicleModelId_fkey"
  FOREIGN KEY ("vehicleModelId") REFERENCES "VehicleModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
