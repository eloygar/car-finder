# Proyecto: Buscador de vehículos de segunda mano (España)

Buscador de coches de segunda mano que agrega anuncios de **Wallapop** mediante su
API interna y los expone a través de una **API propia**, consultando **en tiempo real**
y **sin base de datos**.

> Rediseño v2: se elimina PostgreSQL, Prisma, Redis y el job de sincronización.
> La simplicidad es la arquitectura: cada búsqueda se resuelve contra Wallapop en el momento.

---

## Arquitectura

```text
   Vue 3 (Vite, SPA estática)
            │
            ▼
   API propia (FastAPI, Python)
    - valida y normaliza filtros
    - cachea taxonomía marca/modelo
            │
            ▼
   Wallapop (API interna JSON, sin scraping HTML)
```

- El frontend **nunca** consulta Wallapop directamente.
- Sin BD: no hay persistencia de anuncios, ni sincronización, ni estados `removed`.
- Los resultados son siempre "vivos": lo que devuelve Wallapop en ese instante.

---

## Evaluación: `davstr1/wallapop-api`

Se evalúa [davstr1/wallapop-api](https://github.com/davstr1/wallapop-api) como base
para la comunicación con Wallapop.

**Decisión: usarlo como referencia/documentación, no como dependencia en runtime.**

Motivos:

| Aspecto | Valoración |
|---|---|
| Lenguaje | Node.js/TypeScript. Nuestro backend es Python/FastAPI → no usable como librería |
| Aporte real | Documenta la ingeniería inversa: endpoints, headers mínimos y *gotchas* |
| Alternativa descartada | Ejecutar su servidor Express como sidecar: añade un proceso y un despliegue más, contrario al objetivo de simplificar |
| Portabilidad | Su cliente son ~100 líneas de lógica HTTP → trivial portarlo a `httpx` |

Hallazgos técnicos que adoptamos:

- La API pública de Wallapop solo exige dos cabeceras: `Host: api.wallapop.com` y
  `X-DeviceOS: 0`. **No hay firma HMAC** (`X-Signature`) como se asumía en la spec v1.
- Endpoints útiles: `/api/v3/search`, `/api/v3/items/{id}`, `/api/v3/categories`.
- *Gotchas* documentados:
  - **Proxy**: Wallapop bloquea peticiones directas desde IPs de datacenter (afecta al
    deploy del backend; en local suele funcionar). Variable `PROXY_URL` soportada.
  - **Precios inconsistentes**: `/search` devuelve euros; `/items/{id}` devuelve céntimos.
  - **Paginación**: tokens opacos JWT (`next_page`), no números de página.
  - **Throttling**: si >95% de respuestas son 404, es rate-limiting, no 404s reales.
  - `step=1` y `source=keywords` son obligatorios en búsqueda o devuelve vacío.

---

## Funcionalidades

### Búsqueda

Filtros nativos de la categoría coches de Wallapop (`category_id=100`):

- Marca y modelo (taxonomía capturada: 96 marcas, ver `docs/wallapop-car-taxonomy-capture.json`)
- Precio mínimo / máximo
- Kilometraje máximo
- Año mínimo / máximo
- Combustible
- Cambio (manual / automático)
- Carrocería, potencia (CV), tipo de vendedor
- Provincia (+ distancia)
- Texto libre (keywords)
- Ordenar por: más recientes, precio, relevancia

### Anuncio

Título, descripción, precio, marca, modelo, año, kilómetros, combustible, cambio,
potencia, carrocería, provincia, coordenadas, fecha de publicación, imágenes,
vendedor y URL al anuncio original en Wallapop.

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Python 3.12 + FastAPI + Pydantic + httpx |
| Frontend | Vue 3 + Vite + TypeScript + Tailwind CSS + Vue Router |
| Persistencia | **Ninguna** (opcionalmente caché TTL en memoria para taxonomía/búsquedas repetidas) |
| Despliegue | Frontend: hosting estático (GitHub Pages / Netlify). Backend: Render / Fly.io (free tier) |

---

## Estructura

```text
api/                      # FastAPI
└── app/
    ├── main.py           # entrypoint
    ├── config.py         # settings (pydantic-settings)
    ├── routes/           # /search, /listings, /meta
    ├── wallapop/         # client.py, mapper.py, types.py
    ├── geo/              # provincia → lat/lon (tabla estática)
    └── providers.py      # protocolo VehicleProvider (escalabilidad futura)

web/                      # Vue 3 + Vite
└── src/
    ├── pages/            # SearchPage, ListingDetailPage
    ├── components/       # SearchFilters, ListingCard, ListingGrid
    ├── data/brands.json  # taxonomía marca→modelo (captura estática)
    └── api/client.ts     # fetch wrapper hacia la API propia
```

---

## API propia

```text
GET /api/v1/search?brand=BMW&model=320d&priceMax=15000&province=Madrid&sortBy=recent
GET /api/v1/listings/{id}
GET /api/v1/meta/brands        # taxonomía marca→modelo para los selects
GET /health
```

La paginación usa un cursor opaco: la respuesta incluye `nextCursor` y el frontend
lo reenvía como `cursor` en la siguiente página (Wallapop pagina con tokens JWT).

Documentación interactiva automática: `/docs` (Swagger UI de FastAPI).

---

## Desarrollo local

```bash
# Backend
cd api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload          # http://localhost:8000/docs

# Frontend
cd web
npm install
npm run dev                            # http://localhost:5173
```

Variables de entorno:

```bash
# api/.env
PORT=8000
CORS_ORIGIN=http://localhost:5173
PROXY_URL=              # opcional; necesario si el host tiene IP de datacenter bloqueada
LOG_LEVEL=info

# web/.env
VITE_API_BASE_URL=http://localhost:8000
```

---

## Roadmap (fuera de alcance actual)

- Segundo proveedor (Coches.net, Milanuncios…) implementando `VehicleProvider`
- Caché Redis compartida entre instancias
- Favoritos, alertas de nuevos anuncios, autenticación
- Búsqueda geoespacial por radio (hoy: distancia simple sobre lat/lon de provincia)
- Sincronización dinámica de la taxonomía de marcas/modelos

Ver especificación completa en [`docs/specs-1.md`](docs/specs-1.md).
