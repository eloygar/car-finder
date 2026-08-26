-- Speed up operability/status facets and brand+model grouping used by the saved-listings filters.
CREATE INDEX IF NOT EXISTS "Listing_brand_model_status_idx" ON "Listing" ("brand", "model", "status");
