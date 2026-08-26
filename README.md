# Reservas SIMON INDER

Automatización de la interfaz web de [SIMON 2.0 INDER](https://simon.inder.gov.co/) con Playwright. Busca un escenario, selecciona su división, valida todos los bloques de la franja y, únicamente con `--confirm`, intenta crear la reserva.

El flujo fue contrastado con la interfaz disponible el 26 de agosto de 2026. Como SIMON es un sistema externo, sus textos y estructura pueden cambiar.

## Requisitos e instalación

- Node.js 20 o posterior.
- pnpm.
- Una cuenta válida de SIMON y cédulas de participantes registrados.
- Cumplir las reglas de uso y de reserva del INDER.

```bash
pnpm install
pnpm exec playwright install chromium
cp .env.example .env
```

Completa `.env` localmente:

```dotenv
SIMON_DOCUMENT_TYPE=Cédula de Ciudadanía
SIMON_DOCUMENT_NUMBER=TU_NUMERO_DE_DOCUMENTO
SIMON_PASSWORD=TU_CONTRASENA
SIMON_PARTICIPANTS_CSV=./data/participants.csv
SIMON_SCHEDULES_FILE=./config/schedules.json
```

Si la contraseña contiene `#`, espacios u otros caracteres especiales, enciérrala entre comillas dobles. `.env`, el CSV real, la configuración real de tareas y el estado del programador están ignorados por Git.

## Participantes desde CSV

Crea el archivo local a partir del ejemplo:

```bash
cp data/participants.example.csv data/participants.csv
```

Las cédulas deben estar en la primera columna; las demás columnas se ignoran. El encabezado es opcional:

```csv
cedula,nombre
1000000001,Ana
1000000002,Carlos
```

Cuando el escenario exige participantes, el programa cuenta al titular de la cuenta y toma del CSV solamente la cantidad adicional mínima. Excluye la cédula del titular y elimina duplicados. Si faltan cédulas utilizables, se detiene antes de guardar.

`--participants "DOC2,DOC3"` sigue disponible y reemplaza la selección del CSV para esa ejecución. También puede indicarse otro archivo con `--participants-csv RUTA`.

## Comprobar disponibilidad

```bash
pnpm start -- \
  --scenario "Cancha de vóley playa en arenilla Unidad Deportiva Belén Rincón" \
  --division "Completa" \
  --date 2026-08-29 \
  --start 12:00 \
  --end 14:00 \
  --headed
```

Sin `--confirm` funciona como simulación: inicia sesión, comprueba cada bloque de la franja y termina sin guardar. Una franja como `12:00–14:00` valida por separado `12:00–13:00` y `13:00–14:00`.

Para crear realmente la reserva, revisa los datos y añade `--confirm`:

```bash
pnpm start -- \
  --scenario "Cancha de vóley playa en arenilla Unidad Deportiva Belén Rincón" \
  --division "Completa" \
  --date 2026-08-29 \
  --start 13:00 \
  --end 14:00 \
  --confirm
```

## Tareas semanales

El programador debe permanecer en ejecución. No necesita cron ni dependencias adicionales: comprueba una vez por minuto las tareas configuradas y conserva estado local para no repetir una ejecución tras reiniciarse.

Crea una tarea con el asistente de línea de comandos:

```bash
pnpm schedule:add -- \
  --id voley-sabado \
  --run-day jueves \
  --run-time 06:00 \
  --target-day sábado \
  --scenario "Cancha de vóley playa en arenilla Unidad Deportiva Belén Rincón" \
  --division "Completa" \
  --start 13:00 \
  --end 14:00 \
  --confirm
```

En este ejemplo, cada jueves a las 06:00 (hora de Bogotá) se intenta reservar el sábado siguiente. Omite `--confirm` al crearla si primero quieres observar ejecuciones en modo simulación. Usa `--weeks-ahead 1` para apuntar al mismo día de la semana de la semana posterior.

Administra y prueba las tareas:

```bash
# Ver las tareas configuradas
pnpm schedule -- --list

# Ejecutar una tarea ahora, conservando su modo simulación/real
pnpm schedule -- --run-now voley-sabado

# Mantener activo el programador
pnpm schedule
```

El archivo generado es `config/schedules.json`. También puedes copiar y editar `config/schedules.example.json`. Para dejar el proceso permanente en Linux, adapta `deploy/simon-reservas.service.example` y actívalo como servicio de usuario o del sistema.

## Verificación

```bash
pnpm run check
```

## Límites deliberados

- No sondea agresivamente la disponibilidad: cada tarea se dispara una sola vez en su minuto programado.
- No llama endpoints privados directamente; utiliza la interfaz visible.
- No guarda contraseñas, cookies ni perfiles del navegador en el repositorio.
- No cancela reservas, evade CAPTCHA ni procesa pagos.
- Una ejecución manual o una tarea solo intenta guardar si tiene `--confirm`/`"confirm": true` explícito.
