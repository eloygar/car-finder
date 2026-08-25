# MCP groundwork

The local MCP server exposes two read-only tools over stdio:

- `check_known_issues` queries the curated `KnownIssue` table.
- `estimate_market_price` calculates statistics from active reconciled listings.

Start PostgreSQL, apply migrations, and load the starter records:

```sh
pnpm db:up
pnpm db:migrate
pnpm db:seed-known-issues
```

Exercise both tools through a real MCP client/server subprocess boundary:

```sh
pnpm mcp:smoke -- --brand Toyota --model Corolla --year 2023
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
listings without a classification or with a version older than `v1`. Successful results are stored
in the `classification` JSONB document with `classificationVersion` and `classifiedAt`. A second run
skips current results unless `--force` is passed directly to `pipeline:classify`.

Each listing is processed sequentially. Claude is forced to invoke `check_known_issues`, then
`estimate_market_price`, and finally the local validated `submit_classification` tool. Up to three
images are downloaded from `cdn.wallapop.com`; invalid, oversized, or unavailable images fall back to
text-only classification. A changed `contentHash` prevents an old in-flight result from being saved.

Live commands can incur Anthropic charges. Start with `make classify-one` and inspect the structured
summary, including aggregate input/output token counts, before running `make classify-all`.
