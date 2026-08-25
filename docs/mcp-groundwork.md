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

Anthropic classification, prompts, and writes to the nullable JSONB classification document are deferred
to Phase 3B.
