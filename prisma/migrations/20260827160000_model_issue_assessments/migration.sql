CREATE TABLE "model_issue_assessments" (
    "id" TEXT NOT NULL,
    "vehicleModelId" TEXT NOT NULL,
    "issueKey" TEXT NOT NULL,
    "issueText" TEXT NOT NULL,
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
    CONSTRAINT "model_issue_assessments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "model_issue_assessments_severity_check"
      CHECK ("severity" IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT "model_issue_assessments_cost_check"
      CHECK ("estimatedCostMinEUR" >= 0 AND "estimatedCostMaxEUR" >= "estimatedCostMinEUR"),
    CONSTRAINT "model_issue_assessments_pricing_year_check"
      CHECK ("pricingYear" BETWEEN 2000 AND 2100)
);

CREATE UNIQUE INDEX "model_issue_assessments_vehicleModelId_issueKey_key"
ON "model_issue_assessments"("vehicleModelId", "issueKey");
CREATE INDEX "model_issue_assessments_severity_idx" ON "model_issue_assessments"("severity");
CREATE INDEX "model_issue_assessments_assessedAt_idx" ON "model_issue_assessments"("assessedAt");

ALTER TABLE "model_issue_assessments"
ADD CONSTRAINT "model_issue_assessments_vehicleModelId_fkey"
FOREIGN KEY ("vehicleModelId") REFERENCES "vehicle_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;
