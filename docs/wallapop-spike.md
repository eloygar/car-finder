# Wallapop Spike — 2026-08-21

## Endpoint

```
GET https://api.wallapop.com/api/v3/search
GET https://api.wallapop.com/api/v3/items/{id}
```

Headers mínimas verificadas (residencial, sin proxy):

```
Host: api.wallapop.com
X-DeviceOS: 0
```

Sin HMAC, sin User-Agent obligatorio. `step=1&source=keywords` no son obligatorios en esta versión — búsqueda sin ellos devuelve resultados igualmente (40 items, section `category_feed_results`). Versión anterior (`davstr1`) quizá obsoleta.

## Estructura real

### Search

```json
{
  "data": {
    "section": {
      "type": "organic_search_results" | "category_feed_results",
      "payload": {
        "title": "Find what you want",
        "items": [ { item }, ... ],
        "order": null
      }
    }
  },
  "meta": {
    "next_page": "eyJhbGciOi...JWT opaco",
    "next_section_type": "category_feed_results"
  },
  "stats": { "filters_applied_count": 1 }
}
```

En la captura real del pipeline del 25-08-2026, `type_attributes` llegó en formato
plano (`brand: "Toyota"`, `year: 2019`, `km: 62500`, `horsepower: 122`). El mapper
acepta también el formato histórico `{ "value": ... }` mostrado por `/items/{id}`.

- `category_id=100` correcto (`category_ids` no funciona).
- `items` 40 por defecto. `limit` no respeta (siempre 40). Paginación vía `next_page` JWT (decoded sin verificar = `{searchRequestParams, nextPageParams:{offset, blending_page_initial_offset, step, ...}, exp}`).
- Siguiente página: `?next_page=<JWT>` (con mismo `category_id` y demás params).
- `order_by=price_low_to_high` funciona pero resultados con precio 0 raros. Default `closest` cercano a ubicación IP (Vigo en spike). `most_recent` a validar.

### Item

`GET /items/{id}` → objeto plano, no envuelto en `data`:

```json
{
  "id": "3zlm39m354jx",
  "title": {"original": "Volkswagen Crafter 2017"},
  "description": {"original": "..."},
  "taxonomy": [{"id":"100", "name":"Cars"}],
  "type": "car",
  "user": {"id": "..."},
  "slug": "volkswagen-crafter-2017-1291033993",
  "share_url": "https://wallapop.com/item/volkswagen-crafter-2017-1291033993",
  "images": [{"urls":{"small":"...","medium":"...","big":"..."}}],
  "price": {"cash":{"amount":20000.0,"currency":"EUR"}},
  "location": {"latitude":42.22,"longitude":-8.73,"city":"Vigo","postal_code":"36211"},
  "type_attributes": {
    "brand": {"value":"Volkswagen"},
    "model": {"value":"Crafter"},
    "year": {"value":"2017"},
    "km": {"value":"320000"},
    "engine": {"value":"gasoil"},
    "gear_box": {"value":"manual"},
    "body_type": {"value":"van"},
    "horse_power": {"value":"102.0"},
    "version": {"value":"..."},
    "doors": {"value":"4"},
    "seats": {"value":"3"},
    "eco_label": {"value":"c"}
  }
}
```

### Campos clave para Listing

| Listing | Search `type_attributes`/location/price | Items `type_attributes` map |
|---------|------------------------------------------|-------------------------------|
| price | `price.amount` EUR | `price.cash.amount` EUR — misma unidad, no céntimos |
| brand/model/year/km | `type_attributes.brand/model/year/km` | campos `.value` históricos |
| fuel | `type_attributes.engine` | `engine.value` histórico |
| transmission | `gear_box` → manual/automatic | `gear_box.value` histórico |
| power | `horsepower` | `horse_power.value` histórico |
| body | `body_type` | `body_type.value` histórico |
| province/city | `location.city` + `location.region2` (= provincia) + lat/lon | igual |
| images | `images[].urls.big/medium` | igual |
| url | `https://wallapop.com/item/{slug or web_slug}` | `share_url` |

## Filtros probados

| Parámetro | Resultado |
|-----------|-----------|
| `category_id=100` | OK, 40 coches |
| `keywords=BMW` | OK, filtra por título (equivalente a brand search) |
| `brand=BMW` | OK, nativo (equivale a keywords BMW pero con section `organic_search_results` vs `category_feed_results`) |
| `engine=gasoil` | OK, filtra Diesel (engine values gasoil/gasoline/hybrid...) |
| `latitude=40.4168&longitude=-3.7038&distance=10000` | OK, centra en Madrid 10km, vs default Vigo cuando sin geo |
| `city=Madrid` | NO filtra (ignorado, sigue Vigo) — ciudad se resuelve vía lat/lon+distance, no string |
| `year=2020, km=50000, horse_power=150` | NO filtra (ignorados, devuelve años variados) — nombres param reales desconocidos o no nativos |
| `min_price/max_price` | Ignorados en spike (probado `min_price` no filtra, 24250 fuera de rango). Posible `min_sale_price/max_sale_price` no probado con geo. |
| `order_by` | `price_low_to_high` funciona marginal, default `closest` |

Conclusión: pocos filtros nativos reales expuestos vía query params simples. `brand` y `engine` sí, `keywords` siempre, geo `latitude/longitude/distance` sí. Resto (año, km, potencia) probablemente requieren `filters` JSON o son post-filtro.

## Implicación ciudad + radio

Wallapop resuelve ubicación por coordenadas, no por string city. Para replicar "Ciudad + radio igual que Wallapop": frontend envía `city` (ej. "Madrid") + `distance` → backend mapea `city → (lat,lon)` vía tabla estática (52 capitales provinciales ya en `provinces.py`, reutilizada como ciudades) y envía `latitude/longitude/distance` a Wallapop. Si ciudad no está en tabla, fallback a `keywords` con ciudad o sin geo.

## Notas throttling / proxy

- Desde IP residencial sin proxy funciona. No se observó bloqueo con ráfaga moderada.
- Paginación JWT `next_page` debe reenviarse tal cual como `cursor`.
- Precio misma unidad en ambos endpoints (no céntimos) — mapper normaliza sin /100 pero mantiene lógica defensiva.

## Próximos pasos mapper

- Parsear `data.section.payload.items` como lista base.
- Aceptar atributos planos y el formato histórico `type_attributes.<key>.value`;
  convertir a int/float donde toca.
- `location` con ciudad/provincia/lat/lon.
- `meta.next_page` → `nextCursor`.
