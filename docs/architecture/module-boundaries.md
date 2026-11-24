# Límites entre módulos

## Dirección de dependencias

```text
apps/terminal
  ├── packages/chart-engine
  ├── packages/market-data
  └── packages/market-domain

packages/chart-engine
  └── packages/market-domain

packages/market-data
  └── packages/market-domain

packages/market-domain
  └── sin dependencias internas
```

Las dependencias apuntan hacia modelos y contratos estables. Ningún paquete importa desde una aplicación.

## Propiedad de responsabilidades

### apps/terminal

Posee rutas, layouts, presentación, accesibilidad, composición de islas Preact y adaptación entre la interfaz y los paquetes.

No posee algoritmos de escala, normalización de datos, cálculos OHLCV ni estado interno del motor.

### packages/market-domain

Posee entidades e invariantes financieras puras: instrumentos, velas, valores monetarios, intervalos y resultados de validación.

No conoce proveedores, persistencia, APIs del navegador ni frameworks de UI.

### packages/chart-engine

Posee el modelo visual del gráfico: viewport, coordenadas, escalas, layout, invalidación, rendering, entrada del usuario y extensiones.

No depende de Astro, Preact, Tailwind, proveedores o almacenamiento. Debe poder probarse sin montar la aplicación.

### packages/market-data

Posee contratos de proveedores, capacidades declaradas, normalización de respuestas y manejo de suscripciones.

No decide cómo presentar los datos ni importa algoritmos del motor de gráficos.

## Fronteras de datos

Los adaptadores externos convierten respuestas crudas en modelos válidos del dominio. El motor consume esos modelos mediante contratos explícitos. La interfaz recibe modelos de presentación y comandos; no manipula respuestas crudas de proveedores.

## Extensibilidad

Los nuevos proveedores implementan `MarketDataProvider`. Las nuevas capacidades gráficas se añaden mediante contratos de extensión propios del motor. Los componentes de interfaz consumen APIs públicas de los paquetes y no sus módulos internos.

## Prohibiciones

- Importaciones cíclicas entre paquetes.
- Acceso desde paquetes a `apps/`.
- Dependencias de frameworks en el dominio y en el motor.
- Estado global compartido sin propietario explícito.
- Contratos públicos acoplados a una biblioteca de terceros.
