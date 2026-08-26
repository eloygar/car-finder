# Proyecto: Buscador de vehículos de segunda mano (España)

## Objetivo

Construir un buscador de vehículos de segunda mano que agregue anuncios de diferentes plataformas, comenzando exclusivamente por **Wallapop**, con una arquitectura escalable que permita añadir nuevos proveedores en el futuro (Coches.net, Milanuncios, etc.).

---

# Requisitos

## Fuente de datos

- Utilizar la **API interna de Wallapop** en lugar de hacer scraping del HTML.
- Evitar Selenium, Playwright o scraping visual siempre que sea posible.
- Obtener los datos directamente en formato JSON.
- Investigar y reutilizar proyectos Open Source existentes que ya implementen la comunicación con la API.

---

## Open Source

Evaluar proyectos como:

- wallapop-api
- wallapop-cli
- wallaparser

No se trata de copiar el proyecto completo, sino de:

- comprender el funcionamiento de la API interna;
- reutilizar únicamente la capa de comunicación si aporta valor;
- desarrollar el resto de la arquitectura desde cero.

---

# Arquitectura

```text
                Frontend
                    │
                    ▼
              API Propia (Backend)
                    │
      ┌─────────────┴─────────────┐
      │                           │
      ▼                           ▼
 Cliente Wallapop           Base de datos
(API interna JSON)         PostgreSQL
      │                           ▲
      └─────────────┬─────────────┘
                    │
          Normalización de datos
```

---

# Funcionalidades

## Búsqueda

- Marca
- Modelo
- Precio mínimo
- Precio máximo
- Kilómetros
- Año
- Combustible
- Cambio automático/manual
- Provincia
- Distancia
- Ordenar por:
  - Más recientes
  - Precio
  - Kilómetros

---

## Datos almacenados

Cada anuncio deberá contener como mínimo:

- ID del anuncio
- Título
- Descripción
- Precio
- Marca
- Modelo
- Año
- Kilómetros
- Combustible
- Cambio
- Potencia
- Provincia
- Coordenadas
- Fecha de publicación
- URL del anuncio
- Imágenes
- Estado del anuncio
- Usuario/Vendedor

---

# Base de datos

Guardar únicamente los anuncios necesarios.

Actualizar:

- anuncios nuevos;
- anuncios modificados;
- anuncios eliminados.

Evitar duplicados mediante el ID del anuncio.

---

# Caché

Implementar una capa de caché para:

- reducir llamadas a Wallapop;
- acelerar las búsquedas;
- evitar bloqueos por exceso de peticiones.

---

# API propia

El frontend nunca consultará directamente Wallapop.

Toda la información pasará por una API propia.

Ejemplo:

GET /cars

GET /cars/{id}

GET /search?brand=BMW&model=320d

---

# Escalabilidad

La arquitectura debe permitir añadir nuevos proveedores creando únicamente un nuevo adaptador.

Ejemplo:

```
Provider
 ├── Wallapop
 ├── Coches.net
 ├── Milanuncios
 ├── AutoScout24
 └── Mobile.de
```

Cada proveedor implementará la misma interfaz.

---

# Tecnologías

Backend

- Node.js
- TypeScript
- Express o Fastify

Base de datos

- PostgreSQL

ORM

- Prisma

Caché

- Redis

Frontend

- React
- Next.js

---

# Objetivos técnicos

- Arquitectura limpia.
- Código modular.
- Separación entre dominio e infraestructura.
- Adaptadores para cada marketplace.
- Sistema de actualización incremental.
- API REST documentada.
- Fácil incorporación de nuevas fuentes de datos.

---

# Valor del proyecto

El valor del proyecto no reside en desarrollar un scraper desde cero, sino en construir una plataforma robusta capaz de:

- integrar múltiples marketplaces;
- normalizar datos heterogéneos;
- mantener una base de datos consistente;
- ofrecer búsquedas rápidas;
- ser fácilmente escalable mediante nuevos adaptadores.
