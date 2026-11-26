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

### apps/terminal — identidad y persistencia

Terminal es el único propietario de la autenticación, autorización de aplicación, persistencia de usuario, sincronización entre dispositivos y migración de preferencias.

La persistencia se implementa detrás de repositorios/adaptadores de Terminal. Los componentes no acceden directamente al almacenamiento ni a SDKs de autenticación o backend. El repositorio remoto valida la sesión y deja la autorización final de cada fila en la base de datos.

Los documentos persistidos tienen esquemas versionados y contienen únicamente estado durable confirmado. La selección, hover, previews, cursores e historial Undo/Redo son efímeros.

### packages/chart-engine — estado runtime, no persistencia

El motor administra el estado necesario para renderizar e interactuar con una instancia viva: viewport, escalas, dibujos, selección, previews, historial de edición y orden visual.

El motor recibe datos de mercado ya normalizados, comandos y configuración explícita. Publica eventos y estado serializable para que la aplicación host decida qué conservar. No autentica, no asigna propiedad de cuenta y no guarda ni recupera documentos.

El ChartSnapshot público representa estado runtime para transferencia entre instancias; no es un formato de almacenamiento de cuenta ni debe incluirse íntegramente en una persistencia durable.

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
