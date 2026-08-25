# Local search UI

The local UI starts a real Wallapop vehicle search, writes the matched raw
payloads to `output/raw-listings.json`, and automatically reconciles them into
PostgreSQL. It uses the same atomic output behavior as the Stage 1 command and
the same transactional reconciliation as Phase 2.

## Start in development

```bash
make app
```

Open <http://localhost:5173>. Vite serves the React application and proxies
`/api` requests to the Fastify server on port 3100.

By default the UI follows every cursor until Wallapop exhausts the result set.
The first run can be kept short by opening **Más filtros** and setting **Páginas
por búsqueda** to 1. The normal request interval and retry policy still apply,
so a complete search can take several minutes.

## Run the production build locally

```bash
make app-start
```

This builds the frontend and serves both the UI and API from
<http://127.0.0.1:3100>.

## Filter behavior

Brand, model, location, radius, fuel, transmission, body style, and price are
sent to Wallapop with their verified native query names. Year and mileage are
applied to the captured payloads locally because the current search protocol
does not expose stable query fields for them. Native filters are not reapplied
to compact search items because those payloads often omit transmission and body
attributes even when the upstream filter was applied. Select values come from
the committed taxonomy capture in `docs/wallapop-car-taxonomy-capture.json`.

Only one UI search runs at a time. A failed or incomplete search leaves the
previous output file untouched. The result preview is capped at 100 cards, but
the output file contains every unique matched item from all fetched pages.

The API reuses one Wallapop client while it is running, so the one-second
minimum request interval also applies between consecutive UI searches. Eligible
403, 429, timeout, network, and 5xx failures are retried before the UI receives
a safe error describing whether Wallapop rate limiting, availability, protocol,
or the local capture caused the failure. Transient HTTP 200 responses with a
malformed search envelope are retried as well; Wallapop can emit one near the
end of long cursor chains before returning the valid empty terminal page.

Reconciliation starts only after the capture has completed and its JSON file
has been replaced successfully. If PostgreSQL is unavailable, the valid capture
is retained and the UI reports that database synchronization is pending. No
absent listings are marked unavailable.
