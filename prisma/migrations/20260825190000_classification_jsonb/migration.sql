-- Consolidate extensible classifier output while retaining queryable run metadata.
ALTER TABLE "Listing" ADD COLUMN "classification" JSONB;

UPDATE "Listing"
SET "classification" = jsonb_strip_nulls(
  jsonb_build_object(
    'isDamaged', "isDamaged",
    'damageConfidence', "damageConfidence",
    'repairCost', CASE
      WHEN "repairCostEstimate" IS NOT NULL OR "repairCostReasoning" IS NOT NULL
      THEN jsonb_strip_nulls(jsonb_build_object(
        'estimate', "repairCostEstimate",
        'reasoning', "repairCostReasoning"
      ))
      ELSE NULL
    END,
    'knownIssues', CASE
      WHEN "knownIssues" IS NOT NULL OR "knownIssuesDetail" IS NOT NULL
      THEN jsonb_strip_nulls(jsonb_build_object(
        'found', "knownIssues",
        'detail', "knownIssuesDetail"
      ))
      ELSE NULL
    END
  )
)
WHERE "isDamaged" IS NOT NULL
   OR "damageConfidence" IS NOT NULL
   OR "repairCostEstimate" IS NOT NULL
   OR "repairCostReasoning" IS NOT NULL
   OR "knownIssues" IS NOT NULL
   OR "knownIssuesDetail" IS NOT NULL;

ALTER TABLE "Listing"
  DROP COLUMN "isDamaged",
  DROP COLUMN "damageConfidence",
  DROP COLUMN "repairCostEstimate",
  DROP COLUMN "repairCostReasoning",
  DROP COLUMN "knownIssues",
  DROP COLUMN "knownIssuesDetail";
