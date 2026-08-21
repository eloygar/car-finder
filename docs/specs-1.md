# Especificación MVP v2 — Buscador de vehículos de segunda mano (Wallapop)

> **v2 — Rediseño sin base de datos.** Sustituye a la spec v1 (PostgreSQL + Prisma +
> Redis + cron de sincronización). El cambio de modelo: en lugar de sincronizar
> anuncios a una BD y consultarla, la API consulta a Wallapop **en tiempo real** en
> cada búsqueda, normaliza y devuelve. Menos piezas, un solo estado de verdad.

## 1. Objetivo del proyecto

Proyecto de portfolio. Buscador de coches de segunda mano que consulta anuncios de
**Wallapop únicamente** (API interna JSON, sin scraping HTML/visual) y los expone a
través de una **API propia**. El frontend nunca consulta Wallapop directamente.

La arquitectura insinúa escalabilidad a múltiples proveedores (protocolo
`VehicleProvider`), pero no se implementa un segundo proveedor en este MVP.

No es una app de producción: es un MVP con alcance deliberadamente acotado (sección 10).

---

## 2. Stack tecnológico (cerrado)

### Backend
- Python 3.12 + FastAPI
- Pydantic v2 (modelos y validación de requests)
- `pydantic-settings` para configuración
- httpx (cliente HTTP asíncrono)
- uvicorn como servidor

### Frontend
- Vue 3 + Vite + TypeScript
- Vue Router (filtros de búsqueda en la URL vía `useRoute`/`router.replace`)
- Tailwind CSS

### Infraestructura
- Dos carpetas de nivel raíz: `api/` y `web/`, cada una con su propio manifiesto
  (`requirements.txt` / `package.json`)
- **Sin base de datos, sin ORM, sin Redis, sin cron, sin colas**
- Caché opcional en memoria con TTL (`cachetools`) para taxonomía y búsquedas repetidas;
  es una optimización, no un requisito funcional

### Hosting
- Frontend → hosting estático (GitHub Pages, Netlify o Cloudflare Pages; build de Vite)
- Backend → Render / Fly.io (plan free)
- CORS en el backend configurado para aceptar el origen del frontend
- ⚠️ Riesgo documentado: Wallapop bloquea IPs de datacenter. Si el hosting del backend
  está bloqueado, se enruta el tráfico saliente por `PROXY_URL` (residencial/datacenter proxy)

---

## 3. Evaluación de `davstr1/wallapop-api`

Repositorio evaluado: https://github.com/davstr1/wallapop-api (cliente no oficial de
Wallapop en Node.js: CLI, servidor Express y librería).

**Decisión: referencia técnica, no dependencia runtime.**

| Opción | Veredicto |
|---|---|
| Usar como librería | Imposible: es Node.js, nuestro backend es Python |
| Ejecutar su servidor Express como sidecar | Descartada: proceso extra, deploy extra, contradice la simplificación |
| Portar su lógica de cliente a Python | **Elegida**: son ~100 líneas (headers + query params + backoff) |

Conocimiento que aporta y adoptamos:

1. **Cabeceras mínimas**: solo `Host: api.wallapop.com` y `X-DeviceOS: 0`.
   No existe firma HMAC (`X-Signature`) — la spec v1 lo asumía erróneamente.
   El cliente debe eliminar cualquier otra cabecera.
2. **Endpoints públicos sin auth**:
   - `GET https://api.wallapop.com/api/v3/search`
   - `GET https://api.wallapop.com/api/v3/items/{id}`
   - `GET https://api.wallapop.com/api/v3/categories`
3. **Gotchas**:
   - Proxy necesario desde IPs de datacenter.
   - `/search` devuelve precios en **euros**; `/items/{id}` en **céntimos**.
     El mapper normaliza siempre a euros (float/Decimal).
   - Paginación por tokens opacos JWT (`next_page`), no por número de página.
   - `step=1` y `source=keywords` obligatorios en búsqueda o devuelve resultados vacíos.
   - Throttling se manifiesta como ráfagas de 404 (>95%): detectar y aplicar backoff.

---

## 4. Arquitectura de carpetas

```text
api/
├── app/
│   ├── main.py                      # entrypoint FastAPI + CORS + rutas
│   ├── config.py                    # Settings (pydantic-settings)
│   ├── domain.py                    # modelos Pydantic normalizados (Listing, SearchCriteria…)
│   ├── providers.py                 # protocolo VehicleProvider + registro
│   ├── routes/
│   │   ├── search.py                # GET /api/v1/search
│   │   ├── listings.py              # GET /api/v1/listings/{id}
│   │   └── meta.py                  # GET /api/v1/meta/brands
│   ├── wallapop/
│   │   ├── client.py                # httpx: headers, params, proxy, backoff, throttling
│   │   ├── mapper.py                # raw JSON Wallapop → Listing
│   │   └── wallapop_provider.py     # implementa VehicleProvider
│   └── geo/
│       └── provinces.py             # tabla estática provincia → (lat, lon)
└── tests/
    ├── test_mapper.py
    └── test_search_endpoint.py      # con cliente Wallapop mockeado (respx)

web/
└── src/
    ├── main.ts
    ├── router.ts
    ├── pages/
    │   ├── SearchPage.vue
    │   └── ListingDetailPage.vue
    ├── components/
    │   ├── SearchFilters.vue
    │   ├── ListingCard.vue
    │   └── ListingGrid.vue
    ├── data/
    │   └── brands.json              # taxonomía marca→modelo (captura estática, ya disponible)
    └── api/
        └── client.ts                # fetch wrapper hacia la API propia
```

---

## 5. Modelo de datos (normalizado, sin persistencia)

```python
class Listing(BaseModel):
    id: str                     # ID externo de Wallapop
    provider: str = "wallapop"
    title: str
    description: str | None
    price: float                # euros, normalizado desde céntimos si viene de /items/{id}
    currency: str = "EUR"
    brand: str | None
    model: str | None
    year: int | None
    mileage: int | None         # km
    fuel_type: str | None       # gasoline | gasoil | electric | hybrid | hybrid_plugin | lpg | cng | other
    transmission: str | None    # manual | automatic
    power_cv: int | None
    body_type: str | None
    province: str | None
    latitude: float | None
    longitude: float | None
    seller_type: str | None     # private | professional
    seller_name: str | None
    url: str
    images: list[str]
    published_at: datetime | None
```

Reglas:
- No hay `status`: todo resultado es vivo por definición (sin BD no hay ciclo de vida).
- No hay `rawPayload` persistido; los campos desconocidos se ignoran de forma tolerante
  (el mapper nunca lanza por un enum nuevo: usa `None`/string crudo).
- La validación estricta con enums se aplica solo en `SearchCriteria` (entrada pública),
  no en el pipeline de ingesta.

---

## 6. Cliente Wallapop

- Base: `https://api.wallapop.com/api/v3/search`
- Cabeceras exactas: `Host: api.wallapop.com`, `X-DeviceOS: 0`. Nada más.
- Parámetros confirmados: `keywords`, `category_id=100` (coches), `min_sale_price`,
  `max_sale_price`, `latitude`, `longitude`, `distance`, `order_by`, `step=1`,
  `source=keywords`, `limit`.
- **Filtros nativos de coches**: la captura `docs/wallapop-car-taxonomy-capture.json`
  demuestra que la categoría coches tiene filtros UI nativos de marca, modelo,
  kilometraje, año, combustible, cambio, carrocería, CV, plazas, puertas, color,
  distintivo ambiental y tipo de vendedor. Los nombres exactos de los query params
  correspondientes se descubrirán en el spike inicial (sección 11, paso 1) observando
  las peticiones de la web. Estrategia por filtro:
  1. Si existe param nativo → enviarlo a Wallapop.
  2. Si no → post-filtro sobre los resultados normalizados de la página actual,
     documentándolo como limitación (afecta al conteo, no a la corrección).
- Rate limiting: pocas req/s, backoff exponencial ante 429/403 y ante ráfagas de 404
  (throttling). Sin ráfagas.
- Soporte de proxy saliente vía `PROXY_URL` (httpx `proxies=`).

### Taxonomía marca/modelo
- Capturada manualmente una vez (ya disponible) y servida como fichero estático
  `web/src/data/brands.json`. No se sincroniza dinámicamente en el MVP.

### Geolocalización por provincia
- Tabla estática `api/app/geo/provinces.py` con las 52 provincias españolas → (lat, lon).
- `province=Madrid` + `distance=30000` se traducen a `latitude`/`longitude`/`distance`.

---

## 7. API propia — contrato

```text
GET /api/v1/search
  Query params (todos opcionales):
    q: string                   # keywords de texto libre
    brand: string               # valor de la taxonomía (ej. "BMW")
    model: string               # dependiente de brand
    priceMin: number            # euros
    priceMax: number
    yearMin: int
    yearMax: int
    mileageMax: int             # km
    fuelType: string[]          # gasoline | gasoil | electric | hybrid | hybrid_plugin | lpg | cng | other
    transmission: string[]      # manual | automatic
    bodyType: string[]
    minPowerCv: int
    sellerType: string          # private | professional
    province: string            # nombre de provincia española
    distance: int               # metros, default 50000
    sortBy: string              # recent | price_asc | price_desc (default recent)
    cursor: string              # token opaco de paginación (de nextCursor)
    pageSize: int               # default 20, max 40

  Response 200:
    {
      "results": Listing[],
      "nextCursor": string | null,
      "filtersAppliedNative": string[],   # filtros resueltos por Wallapop
      "filtersAppliedLocal": string[]     # filtros aplicados en post (limitación documentada)
    }

GET /api/v1/listings/{id}
  Response 200: Listing
  Response 404: { "error": "not_found" }

GET /api/v1/meta/brands
  Response 200: { "brands": [{ "name": "Abarth", "models": ["500", "595", …] }, …] }

GET /health
  Response 200: { "status": "ok" }
```

Notas:
- Todas las queries se resuelven contra Wallapop en tiempo real, nunca contra almacenamiento propio.
- No hay `total` fiable: con paginación por cursor y posibles post-filtros locales,
  exponer un total sería engañoso. La UI usa scroll/página a página con `nextCursor`.
- Documentación OpenAPI automática de FastAPI servida en `/docs`.

---

## 8. Frontend — páginas y comportamiento

### `SearchPage`
- Formulario de filtros: texto libre, marca → modelo dependiente (vía `brands.json`),
  precio min/max, año min/max, km máximos, combustible, cambio, carrocería, provincia,
  distancia, orden.
- Estado de filtros sincronizado con la URL (query params), no en store cliente.
- Grid de resultados consumiendo `GET /api/v1/search`; botón/carga "siguiente página"
  usando `nextCursor`.
- Tarjeta de anuncio: imagen, título, precio, año, km, combustible, cambio, provincia.

### `ListingDetailPage`
- Consume `GET /api/v1/listings/{id}`.
- Galería de imágenes, todos los atributos normalizados y enlace al anuncio original
  en Wallapop (`url`).

### General
- El frontend solo llama a la API propia (`VITE_API_BASE_URL` como variable de entorno de build).
- Sin autenticación, sin favoritos, sin estado persistente de usuario.

---

## 9. Variables de entorno

### `api/.env`
```bash
PORT=8000
CORS_ORIGIN=http://localhost:5173
PROXY_URL=                 # opcional; requerido si la IP del host está bloqueada por Wallapop
LOG_LEVEL=info
REQUEST_TIMEOUT_S=15
```

### `web/.env`
```bash
VITE_API_BASE_URL=http://localhost:8000
```

Eliminadas respecto a v1: `DATABASE_URL`, `SYNC_CRON_SCHEDULE`.

---

## 10. Fuera de alcance del MVP (roadmap, no implementar ahora)

- Segundo proveedor real (Coches.net, Milanuncios…) — el protocolo `VehicleProvider`
  queda listo, pero no se construye otro adaptador.
- Caché Redis compartida; la caché en memoria TTL es opcional y local al proceso.
- Favoritos, alertas, histórico de precios, autenticación, multi-idioma.
- Búsqueda geoespacial real por radio sobre puntos arbitrarios (hoy: centro de provincia + distancia).
- Sincronización dinámica de taxonomía con detección de cambios en Wallapop.
- Monorepo con tooling unificado.

Estos puntos deben aparecer en el README como "Roadmap / próximos pasos", sin implementarlos.

---

## 11. Orden de trabajo recomendado

1. **Spike de descubrimiento (crítico)**: con curl y las dos cabeceras, validar
   `/api/v3/search` con `category_id=100`. Reproducir los filtros nativos de coches
   desde la web y capturar los nombres reales de sus query params. Sin esto no se
   diseña el resto de filtros.
2. `wallapop/client.py` standalone: búsqueda real desde Python (headers, proxy, backoff).
3. `wallapop/mapper.py` + `wallapop_provider.py` (implementa `VehicleProvider`).
4. Endpoints FastAPI: `/api/v1/search`, `/api/v1/listings/{id}`, `/api/v1/meta/brands`.
5. Frontend: `SearchPage` + `ListingDetailPage` consumiendo la API.
6. Despliegue (frontend estático + backend free tier) en cuanto la búsqueda funcione
   end-to-end; verificar si el host necesita `PROXY_URL`.
7. README final con arquitectura, decisiones técnicas y roadmap.

---

## 12. Criterios de aceptación del MVP

- [ ] Desde el frontend se puede buscar por texto, marca/modelo, precio, año,
      combustible, cambio y provincia, y los resultados vienen de Wallapop en tiempo real.
- [ ] El detalle de anuncio muestra galería, atributos normalizados y enlace original.
- [ ] La paginación funciona mediante `nextCursor` sin números de página.
- [ ] Los precios se muestran correctamente pese a la inconsistencia euros/céntimos
      entre endpoints (test del mapper lo cubre).
- [ ] Ante throttling (ráfaga de 404) el backend aplica backoff y responde 503 con
      mensaje claro en lugar de colgarse o devolver basura.
- [ ] El frontend está desplegado (estático) y funciona contra la API desplegada.
- [ ] Existe README con arquitectura, decisiones técnicas y roadmap.
- [ ] Al menos un test automatizado cubre el mapper (raw → `Listing`) y uno cubre
      `/api/v1/search` con el cliente Wallapop mockeado.
