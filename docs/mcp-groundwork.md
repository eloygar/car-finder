# MCP groundwork

The local MCP server exposes two classification tools over stdio by default:

- `check_operational_status` uses Claude Sonnet 5 without tools to decide whether the vehicle can
  start and move under its own power, using only evidence grounded in the seller description.
- `check_known_issues_web` uses Claude Haiku 4.5 with Anthropic's native `web_search` tool to
  return documented model-year problems categorized as mechanical, bodywork, interior, or other.

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
```

`classify-dry` only queries PostgreSQL and never starts MCP or Anthropic. Live runs classify active
listings without a classification or with a version older than `v4-operability-model-issues`. Operability is stored
in the `classification` JSONB document with `classificationVersion` and `classifiedAt`. Model-year research is stored
once in `known_model_issues` and linked to every matching listing. A second run
skips current results unless `--force` is passed directly to `pipeline:classify`.

Each listing follows a fixed sequence implemented by the pipeline, with no model acting as a tool
orchestrator. The pipeline first invokes `check_operational_status`. A `non_operational` result is
persisted without a web request. Both `operational` and `unknown` reuse cached model-year research,
or invoke `check_known_issues_web` when no row exists. Listings without a year skip research. Use
`--force --refresh-known-issues` to replace an existing model-year result. A changed `contentHash`
rolls back the complete transaction, including provisional identities and research. Persisted reasoning
and issue descriptions are written in Spanish; literal evidence excerpts keep the seller's language.

Live commands can incur Anthropic charges. Start with `make classify-one` and inspect the structured
summary, including aggregate input/output token counts, before running `make classify-all`.
