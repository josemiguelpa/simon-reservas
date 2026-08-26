# Reservas SIMON INDER

Automatización de la interfaz web de [SIMON 2.0 INDER](https://simon.inder.gov.co/) con Playwright. Busca un escenario, selecciona su división, comprueba un bloque y, únicamente con `--confirm`, intenta crear la reserva.

El flujo fue contrastado con la interfaz disponible el 26 de agosto de 2026. Como SIMON es un sistema externo, sus textos y estructura pueden cambiar.

## Requisitos

- Node.js 20 o posterior.
- Una cuenta válida de SIMON.
- Cumplir las reglas de uso y de reserva del INDER.

## Instalación

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

Completa `.env` localmente. El archivo está ignorado por Git:

```dotenv
SIMON_DOCUMENT_TYPE=Cédula de Ciudadanía
SIMON_DOCUMENT_NUMBER=TU_NUMERO_DE_DOCUMENTO
SIMON_PASSWORD=TU_CONTRASENA
```

Si la contraseña contiene `#`, espacios u otros caracteres especiales, enciérrala entre comillas dobles. No se incluyen credenciales reales en este proyecto.

## Comprobar disponibilidad sin reservar

```bash
npm start -- \
  --scenario "Cancha polideportiva Carpinelo" \
  --division "Completa" \
  --date 2026-08-28 \
  --start 18:00 \
  --end 19:00
```

Este es el modo predeterminado. Inicia sesión, espera a que el calendario termine de cargar y comprueba todos los bloques incluidos en el rango. Por ejemplo, `12:00–14:00` valida por separado `12:00–13:00` y `13:00–14:00`. Se detiene sin guardar nada.

## Crear la reserva

Revisa escenario, división, fecha, horas y participantes. Después añade `--confirm`:

```bash
npm start -- \
  --scenario "Cancha polideportiva Carpinelo" \
  --division "Completa" \
  --date 2026-08-28 \
  --start 18:00 \
  --end 19:00 \
  --participants "DOCUMENTO_2,DOCUMENTO_3,DOCUMENTO_4" \
  --confirm
```

El titular de la cuenta se añade automáticamente. `--participants` solo debe contener las cédulas de las personas adicionales, que deben existir en SIMON. Algunos escenarios exigen un mínimo de participantes; el programa lo comprueba antes de guardar.

Usa `--headed` para ver el navegador durante la ejecución. Si el escenario requiere pago, formularios adicionales, CAPTCHA o aprobación manual, el programa se detiene: no intenta evadir controles ni automatiza pagos.

## Verificación del proyecto

```bash
npm run check
```

## Límites deliberados

- No reserva en bucle ni sondea agresivamente la disponibilidad.
- No llama endpoints privados directamente; utiliza la interfaz visible.
- No guarda contraseñas, cookies ni perfiles del navegador.
- No cancela reservas ni procesa pagos.
- Una reserva real solo se intenta cuando se pasa `--confirm` explícitamente.
