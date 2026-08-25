PNPM ?= pnpm

SEARCH_ID ?= toyota-madrid
MAX_PAGES ?= 1
BRAND ?= Toyota
MODEL ?= Corolla
YEAR ?= 2023

.DEFAULT_GOAL := help

.PHONY: help install setup check test test-integration typecheck \
	db-up db-down db-migrate db-seed search search-one \
	reconcile reconcile-dry mcp-server mcp-smoke app app-build app-start

help:
	@echo "Car Finder development commands"
	@echo ""
	@echo "  make setup             Install dependencies and prepare PostgreSQL"
	@echo "  make check             Run unit tests, typecheck, and integration tests"
	@echo "  make search            Run every configured Wallapop search"
	@echo "  make search-one        Run a limited search (SEARCH_ID, MAX_PAGES)"
	@echo "  make reconcile         Reconcile output/raw-listings.json into PostgreSQL"
	@echo "  make reconcile-dry     Validate and compare listings without writes"
	@echo "  make mcp-smoke         Call both MCP tools (BRAND, MODEL, YEAR)"
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

mcp-server:
	$(PNPM) mcp:server

mcp-smoke:
	$(PNPM) mcp:smoke -- --brand "$(BRAND)" --model "$(MODEL)" --year $(YEAR)

app:
	$(PNPM) app:dev

app-build:
	$(PNPM) web:build

app-start: app-build
	$(PNPM) app:start
