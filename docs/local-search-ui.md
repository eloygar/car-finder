# Local search UI

The local UI starts a real Wallapop vehicle search and writes the matched raw
payloads to `output/raw-listings.json`, using the same atomic output behavior as
the Stage 1 command.

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

Brand, location, radius, and fuel are sent to Wallapop. Model, price, year,
mileage, transmission, and body style are applied to the captured payloads
locally because the current search protocol does not expose stable query fields
for all of them. Select values come from the committed taxonomy capture in
`docs/wallapop-car-taxonomy-capture.json`.

Only one UI search runs at a time. A failed or incomplete search leaves the
previous output file untouched. The result preview is capped at 100 cards, but
the output file contains every unique matched item from all fetched pages.
