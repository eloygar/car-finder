# Plantilla de ejemplos de funcionamiento del vehículo

La fuente editable está en
[`vehicle-operability-examples.template.json`](./vehicle-operability-examples.template.json).

El contrato propuesto para la primera herramienta MCP es:

```text
classify_vehicle_operability(description)
  -> status: operational | non_operational | unknown
  -> confidence: low | medium | high
  -> evidence: string[]
  -> reason: string
```

Aunque la pregunta de negocio es binaria —funciona o no—, `unknown` evita inventar una respuesta
cuando el anuncio no lo dice. En la aplicación se puede tratar `unknown` como “no verificado”, sin
mezclarlo con un vehículo que sabemos que está averiado.

Para rellenar el documento, copia `exampleTemplate` dentro de `examples`, asigna un `id` único y
sustituye todos los marcadores. `evidence` debe contener fragmentos literales de `description`.
Conviene incluir ejemplos claros y casos límite:

- funciona explícitamente;
- no arranca o no circula;
- necesita motor, embrague, batería u otra reparación para circular;
- avería estética que no impide circular;
- descripción sin información mecánica;
- afirmaciones contradictorias;
- abreviaturas, errores ortográficos y lenguaje coloquial en español.

No se deben incluir nombres, teléfonos, matrículas ni otros datos personales del anunciante.
