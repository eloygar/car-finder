PNPM ?= pnpm

SEARCH_ID ?= toyota-madrid
MAX_PAGES ?= 1
BRAND ?= Toyota
MODEL ?= Corolla
DESCRIPTION ?= Funciona perfectamente y se usa a diario.
CLASSIFY_LIMIT ?= 10
CLASSIFY_ID ?=

.DEFAULT_GOAL := help

.PHONY: help install setup check test test-integration typecheck \
	db-up db-down db-migrate db-seed search search-one \
	reconcile reconcile-dry mcp-server mcp-smoke app app-build app-start \
	classify classify-all classify-one classify-dry

help:
	@echo "Car Finder development commands"
	@echo ""
	@echo "  make setup             Install dependencies and prepare PostgreSQL"
	@echo "  make check             Run unit tests, typecheck, and integration tests"
	@echo "  make search            Run every configured Wallapop search"
	@echo "  make search-one        Run a limited search (SEARCH_ID, MAX_PAGES)"
	@echo "  make reconcile         Reconcile output/raw-listings.json into PostgreSQL"
	@echo "  make reconcile-dry     Validate and compare listings without writes"
	@echo "  make classify          Classify pending listings (CLASSIFY_LIMIT)"
	@echo "  make classify-all      Classify every pending or outdated active listing"
	@echo "  make classify-one      Classify one listing (CLASSIFY_ID)"
	@echo "  make classify-dry      Count all pending listings without paid calls"
	@echo "  make mcp-smoke         Call the operational-status MCP tool (DESCRIPTION)"
	@echo "  make mcp-server        Start the MCP stdio server"
	@echo "  make app               Start the local search UI and API"
	@echo "  make app-build         Build the React frontend"
	@echo "  make app-start         Serve a built frontend and local API"
	@echo "  make db-up|db-down     Start or stop local PostgreSQL"
	@echo "  make db-migrate        Apply committed Prisma migrations"
	@echo "  make db-seed           Seed the KnownIssue table"

install:
	$(PNPM) install

setup: install db-up db-migrate db-seed

check: test typecheck test-integration

test:
	$(PNPM) test

test-integration:
	$(PNPM) test:integration

typecheck:
	$(PNPM) typecheck

db-up:
	docker compose up -d --wait postgres

db-down:
	$(PNPM) db:down

db-migrate:
	$(PNPM) db:migrate

db-seed:
	$(PNPM) db:seed-known-issues

search:
	$(PNPM) pipeline:search

search-one:
	$(PNPM) pipeline:search -- --only $(SEARCH_ID) --max-pages $(MAX_PAGES)

reconcile:
	$(PNPM) pipeline:reconcile

reconcile-dry:
	$(PNPM) pipeline:reconcile -- --dry-run

classify:
	$(PNPM) pipeline:classify -- --limit $(CLASSIFY_LIMIT)

classify-all:
	$(PNPM) pipeline:classify -- --all

classify-one:
	@test -n "$(CLASSIFY_ID)" || (echo "CLASSIFY_ID is required" && exit 2)
	$(PNPM) pipeline:classify -- --only "$(CLASSIFY_ID)"

classify-dry:
	$(PNPM) pipeline:classify -- --all --dry-run

mcp-server:
	$(PNPM) mcp:server

mcp-smoke:
	$(PNPM) mcp:smoke -- --description "$(DESCRIPTION)"

app:
	$(PNPM) app:dev

app-build:
	$(PNPM) web:build

app-start: app-build
	$(PNPM) app:start
