# Política de fuentes de datos gratuitas

## Objetivo

OpenView busca ofrecer una plataforma de análisis que no exija una suscripción a OpenView para utilizar sus capacidades principales. Esto no implica que cada fuente de datos externa sea gratuita o permita redistribución.

## Declaraciones obligatorias por proveedor

Cada adaptador documenta:

- Nombre del proveedor y enlaces a sus términos.
- Mercados e instrumentos soportados.
- Disponibilidad de históricos y streaming.
- Latencia y límites de solicitudes conocidos.
- Requisitos de cuenta, autenticación o API key.
- Restricciones de uso personal, comercial y redistribución.
- Requisitos de atribución.
- Costos, límites gratuitos y condiciones de cambio.

## Clasificación de redistribución

- `allowed`: los términos consultados permiten el uso y la redistribución previstos.
- `restricted`: existe una limitación que requiere control técnico o aprobación del usuario.
- `unknown`: no se verificaron condiciones suficientes; no debe presentarse como redistribuible.

## Reglas del producto

- No incrustar claves API en el código del cliente.
- No publicar datos históricos de terceros como si fueran datos propios.
- No ofrecer bypass de paywalls, autenticación o límites de proveedores.
- No confundir datos retrasados con datos en tiempo real.
- No prometer cobertura de mercado antes de probar cada proveedor.
- No persistir ni compartir información cuando los términos no lo permitan.

## Modelo de sostenibilidad

El producto debe seguir siendo utilizable con proveedores gratuitos, datos locales, fixtures o endpoints del propio usuario. Los conectores opcionales no deben convertirse en dependencias del núcleo.
