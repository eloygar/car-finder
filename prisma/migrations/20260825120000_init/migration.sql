-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'wallapop',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER,
    "mileage" INTEGER,
    "fuelType" TEXT,
    "transmission" TEXT,
    "power" INTEGER,
    "bodyType" TEXT,
    "province" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "url" TEXT NOT NULL,
    "images" TEXT[],
    "publishedAt" TIMESTAMP(3),
    "sellerType" TEXT,
    "sellerName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "contentHash" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawPayload" JSONB,
    "isDamaged" BOOLEAN,
    "damageConfidence" TEXT,
    "repairCostEstimate" TEXT,
    "repairCostReasoning" TEXT,
    "knownIssues" BOOLEAN,
    "knownIssuesDetail" TEXT,
    "classificationVersion" TEXT,
    "classifiedAt" TIMESTAMP(3),

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnownIssue" (
    "id" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "yearFrom" INTEGER,
    "yearTo" INTEGER,
    "issueDescription" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "source" TEXT,

    CONSTRAINT "KnownIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Listing_provider_externalId_key" ON "Listing"("provider", "externalId");

-- CreateIndex
CREATE INDEX "Listing_brand_model_idx" ON "Listing"("brand", "model");

-- CreateIndex
CREATE INDEX "Listing_province_idx" ON "Listing"("province");

-- CreateIndex
CREATE INDEX "Listing_price_idx" ON "Listing"("price");

-- CreateIndex
CREATE INDEX "Listing_status_idx" ON "Listing"("status");

-- CreateIndex
CREATE INDEX "KnownIssue_brand_model_idx" ON "KnownIssue"("brand", "model");
