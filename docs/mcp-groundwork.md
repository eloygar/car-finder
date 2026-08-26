# MCP groundwork

The local MCP server exposes one classification tool over stdio by default:

- `classify_vehicle_operability` validates Claude's decision about whether the vehicle can start
  and move under its own power. It accepts only evidence grounded in the seller description.

The previous `check_known_issues` and `estimate_market_price` tools are disabled by default. Set
`MCP_ENABLE_LEGACY_TOOLS=true` only when they are needed for isolated diagnostics.

Start PostgreSQL, apply migrations, and load the starter records:

```sh
pnpm db:up
pnpm db:migrate
pnpm db:seed-known-issues
```

Exercise both tools through a real MCP client/server subprocess boundary:

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
listings without a classification or with a version older than `v2-operability`. Successful results are stored
in the `classification` JSONB document with `classificationVersion` and `classifiedAt`. A second run
skips current results unless `--force` is passed directly to `pipeline:classify`.

Each listing is processed sequentially. Claude receives only the seller description and is forced
to invoke `classify_vehicle_operability` exactly once. The MCP tool validates that every evidence
item is a literal excerpt from that description. No images, prices, vehicle metadata, known-issue
data, or market-price data are used. A changed `contentHash` prevents an old in-flight result from
being saved.

Live commands can incur Anthropic charges. Start with `make classify-one` and inspect the structured
summary, including aggregate input/output token counts, before running `make classify-all`.
