CREATE TABLE "listing_issue_extractions" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "anthropicModel" TEXT NOT NULL,
    "analysisVersion" TEXT NOT NULL,
    "extractedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "listing_issue_extractions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "listing_detected_issues" (
    "id" TEXT NOT NULL,
    "extractionId" TEXT NOT NULL,
    "issueKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" TEXT[] NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "listing_detected_issues_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "listing_detected_issues_category_check"
      CHECK ("category" IN ('mechanical', 'bodywork', 'interior', 'other'))
);

CREATE TABLE "listing_issue_assessments" (
    "id" TEXT NOT NULL,
    "detectedIssueId" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "estimatedCostMinEUR" INTEGER NOT NULL,
    "estimatedCostMaxEUR" INTEGER NOT NULL,
    "reasoning" TEXT NOT NULL,
    "sources" JSONB NOT NULL,
    "pricingYear" INTEGER NOT NULL,
    "anthropicModel" TEXT NOT NULL,
    "analysisVersion" TEXT NOT NULL,
    "assessedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "listing_issue_assessments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "listing_issue_assessments_severity_check"
      CHECK ("severity" IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT "listing_issue_assessments_cost_check"
      CHECK ("estimatedCostMinEUR" >= 0 AND "estimatedCostMaxEUR" >= "estimatedCostMinEUR"),
    CONSTRAINT "listing_issue_assessments_pricing_year_check"
      CHECK ("pricingYear" BETWEEN 2000 AND 2100)
);

CREATE UNIQUE INDEX "listing_issue_extractions_listingId_key"
ON "listing_issue_extractions"("listingId");
CREATE INDEX "listing_issue_extractions_inputHash_idx"
ON "listing_issue_extractions"("inputHash");
CREATE UNIQUE INDEX "listing_detected_issues_extractionId_issueKey_key"
ON "listing_detected_issues"("extractionId", "issueKey");
CREATE INDEX "listing_detected_issues_category_idx"
ON "listing_detected_issues"("category");
CREATE UNIQUE INDEX "listing_issue_assessments_detectedIssueId_key"
ON "listing_issue_assessments"("detectedIssueId");
CREATE INDEX "listing_issue_assessments_severity_idx"
ON "listing_issue_assessments"("severity");
CREATE INDEX "listing_issue_assessments_assessedAt_idx"
ON "listing_issue_assessments"("assessedAt");

ALTER TABLE "listing_issue_extractions" ADD CONSTRAINT "listing_issue_extractions_listingId_fkey"
FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "listing_detected_issues" ADD CONSTRAINT "listing_detected_issues_extractionId_fkey"
FOREIGN KEY ("extractionId") REFERENCES "listing_issue_extractions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "listing_issue_assessments" ADD CONSTRAINT "listing_issue_assessments_detectedIssueId_fkey"
FOREIGN KEY ("detectedIssueId") REFERENCES "listing_detected_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
