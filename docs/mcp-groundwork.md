# MCP groundwork

The local MCP server exposes four analysis tools over stdio by default:

- `check_operational_status` uses Claude Sonnet 5 without tools to decide whether the vehicle can
  start and move under its own power, using only evidence grounded in the seller description.
- `check_known_issues_web` uses Claude Haiku 4.5 with Anthropic's native `web_search` tool to
  return documented model-year problems categorized as mechanical, bodywork, interior, or other.
- `extract_vehicle_issues_from_text` uses Claude Haiku 4.5 without tools to extract defects explicitly
  declared in listing text, preserving literal seller evidence.
- `assess_issue_severity_and_cost` uses Claude Haiku 4.5 and mandatory web search to assess one
  issue's severity and an evidence-based current-year repair-cost range for Spain.

The previous `classify_vehicle_operability`, `check_known_issues`, and `estimate_market_price`
tools are disabled by default. Set
`MCP_ENABLE_LEGACY_TOOLS=true` only when they are needed for isolated diagnostics.

Start PostgreSQL, apply migrations, and load the starter records:

```sh
pnpm db:up
pnpm db:migrate
pnpm db:sync-model-taxonomy
pnpm db:seed-known-issues
```

Exercise the first tool through a real MCP client/server subprocess boundary:

```sh
pnpm mcp:smoke -- --description "Funciona perfectamente y se usa a diario."
```

`mcp:server` uses stdout exclusively for MCP protocol messages. Diagnostics go to stderr.

The seed is deliberately small, illustrative, and incomplete. Its records summarize published
safety recalls and do not establish that every vehicle of a model/year is affected. A VIN should
always be checked with the manufacturer or the relevant national recall service.

## Classification pipeline

Phase 3B connects PostgreSQL, Claude, and this stdio server:

```sh
cp .env.example .env
# Add ANTHROPIC_API_KEY to .env or export it in the shell.
make classify-dry
make classify CLASSIFY_LIMIT=10
make classify-one CLASSIFY_ID=<wallapop-external-id>
make classify-all
make assess-issues-dry
make assess-issues ISSUE_ASSESS_LIMIT=20
```

`classify-dry` only queries PostgreSQL and never starts MCP or Anthropic. Live runs classify active
listings without a classification or with a version older than `v5-operability-listing-issues`. Operability is stored
in the `classification` JSONB document with `classificationVersion` and `classifiedAt`. Model-year research is stored
once in `known_model_issues` and linked to every matching listing. A second run
skips current results unless `--force` is passed directly to `pipeline:classify`.

Each listing follows a fixed sequence implemented by the pipeline, with no model acting as a tool
orchestrator. The pipeline invokes `check_operational_status`, then reuses or creates a description-hash
extraction with `extract_vehicle_issues_from_text`. Empty descriptions are cached as completed empty
extractions without calling Claude. A `non_operational` result is persisted without model-year web research.
Both `operational` and `unknown` reuse cached model-year research,
or invoke `check_known_issues_web` when no row exists. Listings without a year skip research. Use
`--force --refresh-known-issues` to replace an existing model-year result. A changed `contentHash`
rolls back the complete transaction, including provisional identities and research. Persisted reasoning
and issue descriptions are written in Spanish; literal evidence excerpts keep the seller's language.

After a listing and any new model-year issues are committed, missing listing-specific assessments run first,
then missing general model assessments run independently. Listing assessments are owned by their detected
issue and are never shared with model-level results. A changed description, normalized brand/model, or year
replaces the extraction and cascades its previous assessments; price changes do not invalidate extraction.
Listings with a pending listing-specific assessment remain eligible for a normal classification run, so a
failed cost lookup is retried while the matching extraction is reused.
Successful results are cached permanently in `model_issue_assessments` by vehicle model and the SHA-256
hash of normalized issue text. One failed assessment remains pending without rolling back the listing,
known issues, or other successful assessments. `pipeline:assess-issues` backfills existing rows; add
`--force` to replace cached assessments, oldest first. Cached costs retain their original `pricingYear`
and do not expire automatically.

Live commands can incur Anthropic charges. Start with `make classify-one` and inspect the structured
summary, including aggregate input/output token counts, before running `make classify-all`.
When stderr is attached to a terminal, classification also prints a colored `[current/total]` progress
line per listing and a final green/red summary. Set `NO_COLOR=1` to keep progress without ANSI colors,
`CLASSIFY_PROGRESS=never` to suppress it, or `CLASSIFY_PROGRESS=always` to show it when output is piped.
Assessment failures expose stable codes such as `mcp_repair_cost_evidence_insufficient` and
`mcp_anthropic_invalid_request`; the MCP server log also includes Anthropic's request ID when available.
Both web-backed tools aim to resolve their task with one focused search and use `max_uses: 3` as a hard
per-call ceiling. They do not continue a `pause_turn`, because Anthropic applies `max_uses` per API request
and a continuation could otherwise open a second search budget.

## Feature flags

`ENABLE_MODEL_ISSUE_ASSESSMENTS=false` disables severity and repair-cost assessments for general
model issues in both the classification pipeline and `pipeline:assess-issues`.

`ENABLE_LISTING_ISSUE_ASSESSMENTS=false` disables severity and repair-cost assessments for issues
extracted from individual listings. Issue extraction remains enabled, but pending assessments no longer
make a classified listing eligible for another pipeline run. Cached assessments remain stored and are
hidden by the API and UI while the flag is disabled. Set either flag to `true` to restore that enrichment.
