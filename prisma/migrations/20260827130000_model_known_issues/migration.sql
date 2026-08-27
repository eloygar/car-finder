-- Canonical Wallapop model identities and reusable model-year issue research.
CREATE TABLE "vehicle_models" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'wallapop',
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "normalizedBrand" TEXT NOT NULL,
    "normalizedModel" TEXT NOT NULL,
    "taxonomyStatus" TEXT NOT NULL,
    "taxonomySchemaVersion" INTEGER,
    "taxonomyCapturedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vehicle_models_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "known_model_issues" (
    "id" TEXT NOT NULL,
    "vehicleModelId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "mechanical" TEXT[] NOT NULL,
    "bodywork" TEXT[] NOT NULL,
    "interior" TEXT[] NOT NULL,
    "other" TEXT[] NOT NULL,
    "sources" JSONB NOT NULL,
    "hasIssues" BOOLEAN NOT NULL,
    "analysisVersion" TEXT NOT NULL,
    "anthropicModel" TEXT NOT NULL,
    "researchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "known_model_issues_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "known_model_issues_year_check" CHECK ("year" BETWEEN 1886 AND 2100)
);

ALTER TABLE "Listing" ADD COLUMN "vehicleModelId" TEXT;
ALTER TABLE "Listing" ADD COLUMN "knownModelIssuesId" TEXT;

CREATE UNIQUE INDEX "vehicle_models_source_normalizedBrand_normalizedModel_key"
ON "vehicle_models"("source", "normalizedBrand", "normalizedModel");
CREATE INDEX "vehicle_models_brand_model_idx" ON "vehicle_models"("brand", "model");
CREATE UNIQUE INDEX "known_model_issues_vehicleModelId_year_key"
ON "known_model_issues"("vehicleModelId", "year");
CREATE INDEX "known_model_issues_hasIssues_idx" ON "known_model_issues"("hasIssues");
CREATE INDEX "Listing_vehicleModelId_year_idx" ON "Listing"("vehicleModelId", "year");
CREATE INDEX "Listing_knownModelIssuesId_idx" ON "Listing"("knownModelIssuesId");

ALTER TABLE "known_model_issues" ADD CONSTRAINT "known_model_issues_vehicleModelId_fkey"
FOREIGN KEY ("vehicleModelId") REFERENCES "vehicle_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_vehicleModelId_fkey"
FOREIGN KEY ("vehicleModelId") REFERENCES "vehicle_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_knownModelIssuesId_fkey"
FOREIGN KEY ("knownModelIssuesId") REFERENCES "known_model_issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Remove model-level research from listing-owned JSON. Keep the old version so rows are selected for v4.
UPDATE "Listing"
SET "classification" = "classification" - 'knownIssuesWeb'
WHERE "classificationVersion" = 'v3-operability-web-issues'
  AND jsonb_typeof("classification") = 'object';
