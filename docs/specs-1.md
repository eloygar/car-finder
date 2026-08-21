# Especificación MVP — Buscador de vehículos de segunda mano (Wallapop)

## 1. Objetivo del proyecto

Proyecto de portfolio. Construir un buscador de coches de segunda mano que agrega
anuncios de **Wallapop únicamente** (usando su API interna, no scraping HTML/visual),
los normaliza y los expone a través de una **API propia**. El frontend nunca consulta
Wallapop directamente.

La arquitectura debe insinuar escalabilidad a múltiples proveedores (interfaz
`VehicleProvider`), pero **no se implementa** un segundo proveedor en este MVP.

No confundir con una app de producción: es un MVP para portfolio, con alcance
deliberadamente acotado (ver sección 9, "Fuera de alcance").

---

## 2. Stack tecnológico (cerrado)

### Backend
- Node.js + TypeScript
- Fastify
- Zod (validación de requests)
- Prisma ORM
- PostgreSQL (sin PostGIS en el MVP)
- `node-cron` para el job de sincronización (dentro del mismo proceso, sin worker
  separado ni cola de mensajes)
- Pino como logger

### Frontend
- Vite + React + TypeScript
- React Router (estado de filtros de búsqueda en la URL vía `useSearchParams`)
- Tailwind CSS

### Infraestructura
- Sin monorepo formal: dos carpetas de nivel raíz, `api/` y `web/`, cada una con su
  propio `package.json`
- Sin Redis en el MVP (queda como mejora futura documentada en el roadmap)
- Docker Compose solo para desarrollo local (Postgres)

### Hosting
- Frontend → GitHub Pages (build estático de Vite)
- Backend (API + cron) → Render Web Service (plan free)
- Base de datos → Render PostgreSQL (plan free)
- CORS en el backend configurado para aceptar el origen de GitHub Pages

---

## 3. Arquitectura de carpetas

```
api/
└── src/
    ├── domain/
    │   ├── entities/
    │   │   └── Listing.ts              # tipo normalizado de anuncio
    │   └── ports/
    │       └── VehicleProvider.ts      # interfaz que implementará cada proveedor
    ├── providers/
    │   └── wallapop/
    │       ├── WallapopClient.ts       # HTTP client + firma X-Signature
    │       ├── WallapopMapper.ts       # raw JSON de Wallapop → Listing
    │       └── WallapopProvider.ts     # implementa VehicleProvider
    ├── repositories/
    │   └── ListingRepository.ts        # acceso a datos vía Prisma
    ├── routes/
    │   ├── search.routes.ts            # GET /api/v1/search
    │   └── listings.routes.ts          # GET /api/v1/listings/:id
    ├── schemas/
    │   └── searchCriteria.schema.ts    # Zod schema compartido
    ├── jobs/
    │   └── syncListings.job.ts         # node-cron, corre cada N horas
    ├── config/
    │   └── env.ts                      # validación de variables de entorno
    ├── app.ts                          # registro de plugins/rutas Fastify
    └── server.ts                       # entrypoint

web/
└── src/
    ├── pages/
    │   ├── SearchPage.tsx
    │   └── ListingDetailPage.tsx
    ├── components/
    │   ├── SearchFilters.tsx
    │   ├── ListingCard.tsx
    │   └── ListingGrid.tsx
    ├── data/
    │   └── brands.json                 # taxonomía marca→modelo, capturada estáticamente
    ├── api/
    │   └── client.ts                   # fetch wrapper hacia la API propia
    └── main.tsx
```

---

## 4. Modelo de datos (Prisma)

```prisma
model Listing {
  id            String    @id @default(uuid())
  externalId    String    // ID del anuncio en Wallapop
  provider      String    @default("wallapop")
  title         String
  description   String?
  price         Decimal
  brand         String
  model         String
  year          Int?
  mileage       Int?
  fuelType      String?
  transmission  String?   // manual | automatic | semiautomatic
  power         Int?      // CV
  bodyType      String?
  province      String?
  latitude      Float?
  longitude     Float?
  status        String    @default("active") // active | removed
  sellerType    String?   // private | professional
  sellerName    String?
  url           String
  images        String[]
  publishedAt   DateTime?
  firstSeenAt   DateTime  @default(now())
  lastSeenAt    DateTime  @updatedAt
  rawPayload    Json?

  @@unique([provider, externalId])
  @@index([brand, model])
  @@index([province])
  @@index([price])
}
```

Reglas:
- Anti-duplicados por `[provider, externalId]` (upsert).
- No hay borrado físico: un anuncio que deja de aparecer en el sync pasa a
  `status = "removed"`, nunca se elimina de la tabla.
- `rawPayload` guarda el JSON crudo de Wallapop como red de seguridad ante campos
  no mapeados todavía.

---

## 5. Cliente Wallapop

- Endpoint base observado: `https://api.wallapop.com/api/v3/search`
  (parámetros: `keywords`, `category_id`, `latitude`, `longitude`, `min_sale_price`,
  `max_sale_price`, `order_by`, etc. — `category_id=100` es la categoría de coches).
- Wallapop firma ciertas peticiones con cabecera `X-Signature`
  (HMAC-SHA256 sobre `metodo|url|timestamp`). El algoritmo debe implementarse en un
  módulo aislado (`WallapopClient.ts`) para poder sustituirlo rápido si Wallapop lo
  cambia.
- Rate limiting: máximo unas pocas requests por segundo, con backoff exponencial ante
  respuestas 429/403. No hacer ráfagas.
- No usar Selenium/Playwright/scraping visual. Solo HTTP + JSON.

### Validación de datos (laxa en el borde, estricta en la API pública)
- El `WallapopMapper` debe ser tolerante: si aparece un valor de enum no contemplado
  (ej. un `fuelType` nuevo), lo guarda tal cual en `rawPayload` y usa `z.string()`
  internamente, sin lanzar excepción.
- La validación estricta con `z.enum([...])` se aplica solo en el schema de
  `searchCriteria` que expone la API pública (`/api/v1/search`), no en el pipeline de
  ingesta.

### Taxonomía de marcas/modelos
- Se captura una vez de forma manual (ya disponible) y se guarda como fichero estático
  `web/src/data/brands.json`. No se sincroniza dinámicamente en el MVP.

---

## 6. API propia — contrato

```
GET /api/v1/search
  Query params (todos opcionales):
    brand: string
    model: string
    priceMin: number
    priceMax: number
    yearMin: number
    yearMax: number
    mileageMax: number
    fuelType: string[]        // gasoline | gasoil | electric-hybrid | hybride |
                               // hybride_plugin | lpg | cng | others
    transmission: string[]    // manual | automatic | semiautomatic
    province: string
    sortBy: string             // recent | price_asc | price_desc | mileage_asc
    page: number (default 1)
    pageSize: number (default 20, max 50)

  Response 200:
    {
      "results": Listing[],
      "total": number,
      "page": number,
      "pageSize": number
    }

GET /api/v1/listings/:id
  Response 200: Listing
  Response 404: { "error": "not_found" }
```

- Todas las queries de `/search` se resuelven contra PostgreSQL, nunca contra
  Wallapop en tiempo real.
- Documentación OpenAPI generada vía `@fastify/swagger` (sirve en `/docs` en dev).

---

## 7. Job de sincronización

- Implementado con `node-cron`, corre dentro del mismo proceso del servidor Fastify.
- Frecuencia: configurable por variable de entorno (`SYNC_CRON_SCHEDULE`), valor por
  defecto sugerido: cada 3 horas.
- Recorre un set fijo de búsquedas predefinidas (5–10 combinaciones marca/provincia,
  configurables en un array en `syncListings.job.ts`), ejemplo:
  - BMW, Madrid
  - Volkswagen, Barcelona
  - SEAT, Valencia
  - (etc.)
- Por cada anuncio devuelto: `upsert` en `Listing` por `[provider, externalId]`,
  actualiza `lastSeenAt`.
- Al terminar el barrido de una combinación: cualquier `Listing` de esa
  marca/provincia con `lastSeenAt` anterior al inicio del barrido actual →
  `status = "removed"`.
- Logging con Pino de: nº de anuncios nuevos, actualizados, marcados como removed, y
  errores de request.

---

## 8. Frontend — páginas y comportamiento

### `SearchPage`
- Formulario de filtros (marca, modelo dependiente de marca vía `brands.json`,
  rango de precio, rango de año, combustible, cambio, provincia).
- Estado de filtros sincronizado con la URL (query params), no en store cliente.
- Grid de resultados paginado, consumiendo `GET /api/v1/search`.
- Selector de orden (más recientes / precio / km).

### `ListingDetailPage`
- Consume `GET /api/v1/listings/:id`.
- Muestra galería de imágenes, todos los atributos del anuncio, y enlace al anuncio
  original en Wallapop (`url`).

### General
- El frontend solo llama a la API propia (`VITE_API_BASE_URL` como variable de
  entorno de build).
- Sin autenticación, sin favoritos, sin estado persistente de usuario.

---

## 9. Fuera de alcance del MVP (roadmap, no implementar ahora)

- Segundo proveedor real (Coches.net, Milanuncios, etc.) — la interfaz
  `VehicleProvider` debe quedar lista para ello, pero no se construye un segundo
  adaptador.
- PostGIS / búsqueda geoespacial por radio de distancia.
- Redis como caché.
- BullMQ / worker separado para el sync (se usa `node-cron` en el mismo proceso).
- Tabla de taxonomía versionada con detección de cambios en Wallapop.
- Autenticación de usuarios, favoritos, alertas de nuevos anuncios, multi-idioma.
- Monorepo con Turborepo/pnpm workspaces.

Estos puntos deben mencionarse explícitamente en el README del proyecto como
"Roadmap / próximos pasos", sin implementarlos.

---

## 10. Variables de entorno

### `api/.env`
```
DATABASE_URL=postgresql://...
PORT=3000
CORS_ORIGIN=https://<usuario>.github.io
SYNC_CRON_SCHEDULE="0 */3 * * *"
LOG_LEVEL=info
```

### `web/.env`
```
VITE_API_BASE_URL=https://<tu-api>.onrender.com
```

---

## 11. Orden de trabajo recomendado

1. `WallapopClient.ts` como script standalone: validar que la firma `X-Signature`
   funciona y que se obtiene JSON real de búsqueda, antes de tocar nada más.
2. Modelo de datos Prisma + migración inicial contra Postgres local (Docker Compose).
3. `WallapopMapper.ts` + `WallapopProvider.ts` (implementación de `VehicleProvider`).
4. Endpoint `GET /api/v1/search` leyendo de la base de datos (con datos sembrados
   manualmente para probar, aún sin cron).
5. Endpoint `GET /api/v1/listings/:id`.
6. `syncListings.job.ts` con `node-cron`, probado manualmente antes de dejarlo
   programado.
7. Frontend: `SearchPage` + `ListingDetailPage` consumiendo la API.
8. Despliegue: Render (API + Postgres) y GitHub Pages (frontend) — hacerlo en cuanto
   el endpoint de búsqueda funcione end-to-end, no esperar al final.
9. README con diagrama de arquitectura, decisiones técnicas, y sección de roadmap
   (sección 9 de este documento).

---

## 12. Criterios de aceptación del MVP

- [ ] Se puede buscar por marca, modelo, precio, año, combustible, cambio y
      provincia desde el frontend, y los resultados vienen de la BD propia.
- [ ] El cron de sincronización trae anuncios reales de Wallapop y los persiste sin
      duplicados.
- [ ] Un anuncio que desaparece de Wallapop queda marcado `removed` en el siguiente
      sync, no se borra.
- [ ] El frontend está desplegado en GitHub Pages y funciona contra la API en Render.
- [ ] Existe un README con arquitectura, decisiones técnicas y roadmap.
- [ ] Al menos un test automatizado cubre el `WallapopMapper` (raw → `Listing`) y
      uno cubre el endpoint `/api/v1/search`.