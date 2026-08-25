# Especificación MVP — Buscador de vehículos de segunda mano con clasificación IA (Wallapop)

## 1. Objetivo del proyecto

Proyecto de portfolio. Pipeline en **tres fases desacopladas y ejecutadas manualmente**:

1. **Búsqueda batch** contra la API interna de Wallapop → JSON crudo de anuncios.
2. **Clasificación con IA** de cada anuncio nuevo/modificado, usando un **servidor MCP
   real** con herramientas de análisis (daño, coste de reparación, modelos
   problemáticos conocidos).
3. **Scoring de fitness**: el usuario define qué busca (coche fiable / chollo para
   reparar / etc.) y el sistema ordena los anuncios almacenados según cuánto encajan
   con ese perfil.

No hay sincronización en tiempo real ni cron automático en el MVP — todo el pipeline
de datos (búsqueda + clasificación) se ejecuta manualmente vía CLI. La API y el
frontend sí quedan desplegados y disponibles de forma continua para consulta.

El frontend nunca consulta Wallapop directamente ni ejecuta clasificación: solo lee
de la base de datos a través de la API propia.

---

## 2. Stack tecnológico (cerrado)

### Pipeline de datos (ejecución local/manual)
- Node.js + TypeScript
- `@modelcontextprotocol/sdk` — servidor MCP real (transporte stdio)
- Anthropic SDK (`@anthropic-ai/sdk`) — cliente que llama a Claude con tool use
  conectado al servidor MCP, para clasificar cada anuncio
- Prisma (mismo cliente que usa la API, para escribir directamente en la BD remota)

### Backend (API de consulta, desplegado)
- Fastify + TypeScript
- Zod (validación)
- Prisma ORM
- PostgreSQL
- Pino (logging)

### Frontend
- Vite + React + TypeScript
- React Router (filtros y perfil de fitness en la URL)
- Tailwind CSS

### Infraestructura
- Sin monorepo formal: carpetas de nivel raíz `pipeline/`, `api/`, `web/`,
  `mcp-server/`
- Sin Redis, sin PostGIS, sin cola de mensajes — no se necesitan para el MVP
- Docker Compose solo para Postgres en desarrollo local

### Hosting
- Frontend → GitHub Pages (build estático de Vite)
- Backend (API de solo lectura) → Render Web Service (plan free)
- Base de datos → Render PostgreSQL (plan free)
- El pipeline (`pipeline/` y `mcp-server/`) **no se despliega** — se ejecuta en local
  contra la `DATABASE_URL` de Render vía túnel/conexión directa

---

## 3. Arquitectura general

```
┌──────────────────────────────────────────────────────────────────────┐
│  PIPELINE (ejecución manual, local, vía CLI)                          │
│                                                                        │
│  1. search   → pipeline/search.ts                                     │
│     WallapopClient (firma X-Signature) → array de JSON crudo          │
│                    │                                                   │
│  2. reconcile → pipeline/reconcile.ts                                 │
│     Compara contra BD por externalId + contentHash                    │
│     → clasifica: nuevo / cambiado / sin cambios / desaparecido        │
│                    │                                                   │
│  3. classify → pipeline/classify.ts                                   │
│     Solo anuncios nuevos/cambiados                                    │
│     Claude (Anthropic API, tool use) ←→ mcp-server/ (MCP real)        │
│         tools: check_known_issues, estimate_market_price              │
│     → añade campos de clasificación al registro                      │
│                    │                                                   │
│  4. persist  → upsert en PostgreSQL (Prisma)                          │
└──────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│  API DE CONSULTA (desplegada, siempre disponible)                     │
│  Fastify → lee de PostgreSQL → calcula fitness en la capa de app     │
│  GET /api/v1/search?fitnessProfile=coche-fiable&sortBy=fitness        │
└──────────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────────┐
│  FRONTEND (GitHub Pages)                                              │
│  Formulario de búsqueda + selector de perfil de fitness              │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 4. Estructura de carpetas

```
pipeline/
└── src/
    ├── search.ts                    # CLI: ejecuta búsquedas contra Wallapop
    ├── reconcile.ts                 # CLI: diff contra BD, marca estados
    ├── classify.ts                  # CLI: clasifica pendientes vía MCP + Claude
    ├── wallapop/
    │   ├── WallapopClient.ts        # HTTP client + firma X-Signature
    │   └── WallapopMapper.ts        # raw JSON → Listing (sin clasificar)
    ├── config/searches.ts           # array de combinaciones marca/provincia a buscar
    └── db/client.ts                 # Prisma client compartido

mcp-server/
└── src/
    ├── server.ts                    # servidor MCP (stdio transport)
    ├── tools/
    │   ├── checkKnownIssues.ts      # consulta tabla KnownIssue en BD
    │   └── estimateMarketPrice.ts   # compara contra precios ya almacenados
    └── db/client.ts

api/
└── src/
    ├── domain/
    │   ├── entities/Listing.ts
    │   └── fitness/
    │       ├── FitnessProfile.ts    # tipo + perfiles predefinidos
    │       └── calculateFitness.ts  # función pura de scoring
    ├── repositories/ListingRepository.ts
    ├── routes/
    │   ├── search.routes.ts
    │   └── listings.routes.ts
    ├── schemas/searchCriteria.schema.ts
    ├── config/env.ts
    ├── app.ts
    └── server.ts

web/
└── src/
    ├── pages/
    │   ├── SearchPage.tsx
    │   └── ListingDetailPage.tsx
    ├── components/
    │   ├── SearchFilters.tsx
    │   ├── FitnessProfileSelector.tsx
    │   ├── ListingCard.tsx          # muestra fitness score + badges de clasificación
    │   └── ListingGrid.tsx
    ├── data/brands.json
    ├── api/client.ts
    └── main.tsx

prisma/
└── schema.prisma                    # compartido por pipeline, mcp-server y api
```

---

## 5. Modelo de datos (Prisma)

```prisma
model Listing {
  id                    String    @id @default(uuid())
  externalId            String
  provider              String    @default("wallapop")
  title                 String
  description           String?
  price                 Decimal
  brand                 String
  model                 String
  year                  Int?
  mileage               Int?
  fuelType              String?
  transmission          String?
  power                 Int?
  bodyType              String?
  province               String?
  latitude              Float?
  longitude             Float?
  url                   String
  images                String[]
  publishedAt           DateTime?
  sellerType            String?
  sellerName            String?

  // Estado / reconciliación
  status                String    @default("active") // active | unavailable
  contentHash           String    // hash(title+description+price), detecta ediciones
  firstSeenAt           DateTime  @default(now())
  lastSeenAt            DateTime  @updatedAt
  rawPayload            Json?

  // Clasificación IA
  isDamaged             Boolean?
  damageConfidence       String?   // low | medium | high
  repairCostEstimate     String?   // none | low | medium | high
  repairCostReasoning     String?
  knownIssues            Boolean?
  knownIssuesDetail       String?
  classificationVersion   String?   // ej. "v1", permite re-clasificar en masa al mejorar el prompt
  classifiedAt            DateTime?

  @@unique([provider, externalId])
  @@index([brand, model])
  @@index([province])
  @@index([price])
  @@index([status])
}

model KnownIssue {
  id               String   @id @default(uuid())
  brand            String
  model            String
  yearFrom         Int?
  yearTo           Int?
  issueDescription String
  severity         String   // low | medium | high
  source           String?  // de dónde sale el dato (curado a mano en el MVP)

  @@index([brand, model])
}
```

Reglas:
- Anti-duplicados por `[provider, externalId]`.
- No hay borrado físico. `status = "unavailable"` cuando un anuncio deja de aparecer
  en un barrido de búsqueda.
- `contentHash` es la clave para decidir si re-clasificar: si no cambió, no se
  vuelve a llamar a la IA (ahorra coste).
- `KnownIssue` se siembra manualmente con un seed de 20-30 filas curadas a mano para
  el MVP — no hay integración con una API externa real de fiabilidad de coches.

---

## 6. Fase 1 — Script de búsqueda (`pipeline/search.ts`)

- CLI ejecutado manualmente: `pnpm pipeline:search`
- Recorre un array fijo de combinaciones de búsqueda definidas en
  `pipeline/src/config/searches.ts` (ej. 5–10 combinaciones marca/provincia).
- Cliente Wallapop:
  - Endpoint: `https://api.wallapop.com/api/v3/search` (`category_id=100` para
    coches).
  - Cabecera `X-Signature` (HMAC-SHA256 sobre `metodo|url|timestamp`), aislada en
    `WallapopClient.ts` para poder ajustarla si Wallapop cambia el algoritmo.
  - Rate limiting: pocas requests por segundo, backoff exponencial ante 429/403.
  - Sin Selenium/Playwright — solo HTTP + JSON.
- Cada búsqueda se pagina hasta agotar resultados (o hasta un límite configurable de
  páginas, para no disparar el volumen en el MVP).
- Salida: no escribe directamente en BD — pasa el array de JSON crudo a la fase de
  reconciliación (puede hacerse como pipeline en memoria dentro del mismo comando,
  o guardando un fichero intermedio `output/raw-listings.json` para poder inspeccionar
  antes de continuar).

---

## 7. Fase 2 — Reconciliación (`pipeline/reconcile.ts`)

- CLI: `pnpm pipeline:reconcile`
- Por cada anuncio crudo:
  - Calcula `contentHash` = hash de `title + description + price`.
  - Si `externalId` no existe en BD → marca como **nuevo** (pendiente de clasificar).
  - Si existe y el hash coincide → solo actualiza `lastSeenAt`, sin reclasificar.
  - Si existe y el hash difiere → actualiza campos base y marca como **pendiente de
    reclasificación** (borra los campos de clasificación o los deja pero con
    `classificationVersion` desactualizada, a decidir en implementación).
- Al terminar el barrido completo de una combinación marca/provincia: cualquier
  `Listing` de esa combinación con `lastSeenAt` anterior al inicio del barrido actual
  → `status = "unavailable"`.
- Los "nuevos" y "pendientes de reclasificación" quedan identificados (por ejemplo,
  `classifiedAt IS NULL` o `classificationVersion` distinta de la versión vigente)
  para que la fase 3 los recoja.

---

## 8. Fase 3 — Clasificación vía MCP (`pipeline/classify.ts` + `mcp-server/`)

### Servidor MCP (`mcp-server/`)
- Servidor MCP real, protocolo completo, transporte **stdio** (se lanza como
  subproceso desde el script de clasificación, no como servicio persistente).
- Tools expuestas:
  - **`check_known_issues(brand: string, model: string, year?: number)`** → consulta
    la tabla `KnownIssue` en PostgreSQL y devuelve si hay problemas conocidos
    documentados para esa combinación, con el detalle.
  - **`estimate_market_price(brand: string, model: string, year?: number)`** →
    calcula precio medio de anuncios ya almacenados para ese modelo/año, para dar
    contexto de si el precio del anuncio actual es alto/bajo/normal.

### Orquestador de clasificación (`pipeline/classify.ts`)
- CLI: `pnpm pipeline:classify`
- Levanta el servidor MCP como subproceso y conecta un cliente MCP.
- Por cada `Listing` pendiente:
  - Llama a la API de Anthropic (Claude) con:
    - El título y la descripción del anuncio.
    - `mcp_servers` / tools disponibles apuntando al servidor MCP local.
    - Salida forzada a JSON Schema estructurado:
      ```json
      {
        "isDamaged": boolean,
        "damageConfidence": "low" | "medium" | "high",
        "repairCostEstimate": "none" | "low" | "medium" | "high",
        "repairCostReasoning": string,
        "knownIssues": boolean,
        "knownIssuesDetail": string | null
      }
      ```
    - El modelo decide si invoca `check_known_issues` (y opcionalmente
      `estimate_market_price`) antes de devolver el JSON final.
  - Persiste el resultado en el `Listing`, junto con `classificationVersion` (ej.
    `"v1"`, constante definida en el propio script) y `classifiedAt = now()`.
- Manejo de errores: si una clasificación falla (error de API, JSON inválido), se
  loguea y se deja el anuncio sin `classifiedAt` para reintentar en la siguiente
  ejecución — no debe abortar todo el batch.
- Sin Batches API ni paralelismo agresivo en el MVP: procesamiento secuencial simple,
  con un límite configurable de anuncios por ejecución (para controlar coste mientras
  se prueba).

---

## 9. Fase 4 — Algoritmo de fitness

Vive en la **API de consulta**, no en el pipeline — se calcula en el momento de la
búsqueda del usuario, sobre los campos ya clasificados y almacenados. No requiere
llamar a la IA de nuevo.

```typescript
type FitnessProfile = {
  id: string;
  label: string;
  isDamaged: { target: boolean; weight: number } | null;
  repairCostEstimate: {
    target: "none" | "low" | "medium" | "high";
    weight: number;
  } | null;
  knownIssues: { target: boolean; weight: number } | null;
  priceWeight: number; // cuánto pesa "más barato, mejor" dentro de los resultados filtrados
};
```

Perfiles predefinidos en `api/src/domain/fitness/FitnessProfile.ts` (mínimo 2 para el
MVP):

- `"coche-fiable"`: `isDamaged=false` (peso alto), `repairCostEstimate=none` (peso
  alto), `knownIssues=false` (peso alto), `priceWeight` bajo.
- `"chollo-para-reparar"`: `isDamaged=true` (peso medio), `repairCostEstimate=low`
  (peso alto), `priceWeight` alto.

`calculateFitness(listing, profile)` devuelve un número (por ejemplo 0–100) sumando
la contribución ponderada de cada eje según cuánto coincide el valor del anuncio con
el `target` del perfil. Anuncios sin clasificar (`classifiedAt = null`) quedan fuera
del ordenamiento por fitness (se excluyen o van al final, a decidir en
implementación) — no se puede puntuar lo que no se ha clasificado todavía.

El cálculo se hace en la capa de aplicación (Node), no en SQL: se filtra primero por
los criterios de búsqueda normales (marca, precio, etc.) contra Postgres, y sobre ese
subconjunto (esperado: cientos de filas, no miles) se calcula y ordena por fitness en
memoria. Es aceptable en el volumen de datos de un MVP.

---

## 10. API propia — contrato

```
GET /api/v1/search
  Query params (todos opcionales):
    brand, model: string
    priceMin, priceMax: number
    yearMin, yearMax: number
    mileageMax: number
    fuelType: string[]
    transmission: string[]
    province: string
    fitnessProfile: string        // id de un perfil predefinido, ej. "coche-fiable"
    sortBy: string                 // recent | price_asc | price_desc | mileage_asc | fitness_desc
    page, pageSize: number

  Response 200:
    {
      "results": (Listing & { fitnessScore: number | null })[],
      "total": number,
      "page": number,
      "pageSize": number
    }

GET /api/v1/listings/:id
  Response 200: Listing & { fitnessScore: number | null } (si se pasa ?fitnessProfile=)
  Response 404: { "error": "not_found" }

GET /api/v1/fitness-profiles
  Response 200: FitnessProfile[]   // para poblar el selector del frontend
```

Todas las queries de `/search` leen de PostgreSQL. La API nunca llama a Wallapop ni
a Anthropic — esas llamadas son exclusivas del pipeline manual.

---

## 11. Frontend — páginas y comportamiento

### `SearchPage`
- Filtros habituales (marca, modelo, precio, año, combustible, cambio, provincia).
- **Selector de perfil de fitness** (`FitnessProfileSelector`), poblado desde
  `GET /api/v1/fitness-profiles`.
- Grid de resultados: cada `ListingCard` muestra el `fitnessScore` (si hay perfil
  seleccionado) y badges visuales de clasificación (ej. "⚠️ Averiado", "🔧 Reparación
  baja", "❗ Modelo con incidencias conocidas").
- Orden por fitness disponible solo cuando hay un perfil seleccionado; si no, orden
  por precio/km/fecha como antes.

### `ListingDetailPage`
- Todos los atributos + sección explícita de "Análisis IA": daño, coste estimado de
  reparación con el razonamiento (`repairCostReasoning`), incidencias conocidas del
  modelo.
- Enlace al anuncio original en Wallapop.

---

## 12. Variables de entorno

### `pipeline/.env` y `mcp-server/.env` (comparten `DATABASE_URL`)
```
DATABASE_URL=postgresql://...          # apunta a la BD de Render, también en local
ANTHROPIC_API_KEY=sk-ant-...
CLASSIFICATION_VERSION=v1
CLASSIFICATION_BATCH_LIMIT=50          # límite de anuncios a clasificar por ejecución
```

### `api/.env`
```
DATABASE_URL=postgresql://...
PORT=3000
CORS_ORIGIN=https://<usuario>.github.io
LOG_LEVEL=info
```

### `web/.env`
```
VITE_API_BASE_URL=https://<tu-api>.onrender.com
```

---

## 13. Fuera de alcance del MVP (roadmap, no implementar ahora)

- Automatización del pipeline (GitHub Actions u otro cron) — queda documentado como
  siguiente paso, pero el MVP se ejecuta 100% manual.
- Segundo proveedor de anuncios (Coches.net, Milanuncios...).
- Anthropic Batches API para clasificación masiva de bajo coste.
- Integración con una API externa real de fiabilidad de modelos (se usa una tabla
  `KnownIssue` curada a mano).
- PostGIS / búsqueda geoespacial por radio.
- Redis / caché.
- Autenticación de usuarios, favoritos, alertas, perfiles de fitness personalizados
  por el usuario final (en el MVP los perfiles son fijos, definidos en código).
- Re-clasificación masiva automática al cambiar `CLASSIFICATION_VERSION` (en el MVP
  se puede lanzar manualmente si hace falta).

---

## 14. Orden de trabajo recomendado

1. `WallapopClient.ts` como script standalone: validar firma `X-Signature` y
   obtención real de JSON.
2. `schema.prisma` completo (incluye `KnownIssue`) + migración + seed manual de
   10-30 filas en `KnownIssue`.
3. `pipeline/search.ts`: guarda un `output/raw-listings.json` de prueba con
   resultados reales.
4. `pipeline/reconcile.ts`: probarlo contra el JSON de prueba, verificar que detecta
   nuevos/cambiados/sin cambios correctamente.
5. `mcp-server/`: implementar y probar las dos tools de forma aislada (fuera del
   flujo de clasificación) antes de integrarlas.
6. `pipeline/classify.ts`: conectar cliente MCP + Anthropic API, clasificar un lote
   pequeño (2-3 anuncios) y revisar manualmente la calidad de la clasificación antes
   de escalar.
7. `api/src/domain/fitness/calculateFitness.ts`: función pura, con tests unitarios
   sobre casos conocidos (anuncio ideal, anuncio pésimo, anuncio sin clasificar).
8. Endpoints `/api/v1/search`, `/api/v1/listings/:id`, `/api/v1/fitness-profiles`.
9. Frontend: `SearchPage` + `FitnessProfileSelector` + `ListingDetailPage`.
10. Despliegue: Render (API + Postgres) y GitHub Pages (frontend).
11. Ejecutar el pipeline completo manualmente contra la BD de producción para poblar
    datos reales antes de la demo.
12. README con arquitectura, decisiones técnicas, coste aproximado de clasificación
    y roadmap (sección 13).

---

## 15. Criterios de aceptación del MVP

- [ ] `pnpm pipeline:search` obtiene anuncios reales de Wallapop para las
      combinaciones configuradas.
- [ ] `pnpm pipeline:reconcile` detecta correctamente anuncios nuevos, sin cambios,
      modificados y desaparecidos, sin duplicados.
- [ ] `pnpm pipeline:classify` clasifica anuncios pendientes usando el servidor MCP
      real y dejar constancia de `classificationVersion` y `classifiedAt`.
- [ ] La tool `check_known_issues` es invocada de verdad por el modelo (verificable
      en logs) al menos en algún anuncio de prueba.
- [ ] El frontend permite elegir un perfil de fitness y ordenar resultados por
      `fitnessScore`.
- [ ] Un anuncio no clasificado no rompe el ordenamiento por fitness (se excluye o
      va al final, de forma consistente).
- [ ] El pipeline completo, ejecutado manualmente de principio a fin, deja la BD de
      Render con datos reales y clasificados.
- [ ] Frontend desplegado en GitHub Pages, funcionando contra la API en Render.
- [ ] Tests unitarios: `calculateFitness`, `WallapopMapper`, y el criterio de
      reconciliación (hash → nuevo/sin cambios/modificado).
- [ ] README con arquitectura, decisiones técnicas y roadmap.