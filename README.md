# simon-reservas

Servicio HTTP y CLI para automatizar reservas en SIMON 2.0 INDER con Playwright.

## Requisitos

- Node.js 20 o posterior.
- Credenciales válidas de SIMON, en variables de entorno o en cada request.

## Variables de entorno

```dotenv
SIMON_DOCUMENT_TYPE=Cédula de Ciudadanía
SIMON_DOCUMENT_NUMBER=TU_NUMERO_DE_DOCUMENTO
SIMON_PASSWORD=TU_CONTRASENA
# SIMON_ROLE=Nombre exacto del perfil

HOST=0.0.0.0
PORT=3000

# Abre un navegador visible en vez de headless. La imagen Docker lo activa
# porque SIMON bloquea Chromium headless (ver la sección Docker).
# HEADED=true
# Carpeta donde se guardan los diagnósticos de fallo. Por defecto: debug
# DEBUG_DIR=debug
```

## Instalación local

```bash
pnpm install
npx playwright install chromium
cp .env.example .env
```

## API HTTP

```bash
npm start        # producción
npm run dev      # recarga al guardar cambios (node --watch)
```

### Health

```bash
curl http://localhost:3000/health
```

### Validar

Consulta la disponibilidad sin reservar. El rango puede cubrir varios bloques.
`confirm` se ignora en este endpoint: siempre es una simulación.

```bash
curl -X POST http://localhost:3000/reservas/validar \
  -H 'content-type: application/json' \
  -d '{"scenario":"Cancha polideportiva Carpinelo","division":"Completa","date":"2026-08-28","start":"18:00","end":"19:00","participants":["DOC2"],"confirm":false,"headed":false}'
```

### Reservar

```bash
curl -X POST http://localhost:3000/reservas \
  -H 'content-type: application/json' \
  -d '{"scenario":"Cancha polideportiva Carpinelo","division":"Completa","date":"2026-08-28","start":"18:00","end":"19:00","participants":["DOC2"],"confirm":true,"headed":false}'
```

**Un bloque por request.** SIMON no permite reservar un segundo bloque con las
mismas cédulas, así que con `confirm: true` el rango debe cubrir exactamente un
bloque. Para reservar dos horas seguidas hay que enviar dos requests, cada uno
con otra cuenta y otro conjunto de participantes.

### Credenciales por request

Por defecto se usan las variables `SIMON_*` del entorno. Para reservar con otra
cuenta, envía `credentials` en el cuerpo (`documentType` y `role` son opcionales):

```json
{
  "credentials": {
    "documentNumber": "DOC",
    "password": "CLAVE",
    "documentType": "Cédula de Ciudadanía",
    "role": "Ciudadano"
  }
}
```

El titular de la cuenta cuenta como participante: si el escenario exige un mínimo
de 4 usuarios, envía 3 cédulas en `participants`.

Sirve el servicio solo sobre una red de confianza: las contraseñas viajan en el
cuerpo del request y no hay TLS ni autenticación.

### Respuestas de error

Todas tienen la forma `{"ok":false,"errorCode":"…","message":"…"}`.

| HTTP | `errorCode` | Cuándo |
| --- | --- | --- |
| 400 | `INVALID_PAYLOAD` | Falta un campo, el rango cubre más de un bloque con `confirm`, o faltan credenciales. |
| 400 | `INVALID_JSON` | El cuerpo no es JSON válido. |
| 404 | `NOT_FOUND` | Ruta inexistente. |
| 409 | `NOT_AVAILABLE` | Algún bloque del rango ya está ocupado. |
| 502 | `SIMON_REJECTED` | SIMON respondió con error al guardar la reserva. |
| 500 | `INTERNAL_ERROR` | Cualquier otro fallo, normalmente un timeout de Playwright. |

## Diagnóstico de fallos

Cuando una corrida falla, el servicio guarda en `DEBUG_DIR` (por defecto `debug/`)
una captura de pantalla, el HTML de la página y su URL, nombrados según el paso
donde falló (`login`, `open-scenario`, `choose-division`, `inspect-blocks`,
`configure-block`, `finalize`). La contraseña y el número de documento se redactan
del HTML. Para sacarlos del contenedor:

```bash
docker compose cp simon-reservas:/app/debug ./debug
```

Esa carpeta está en `.gitignore` y `.dockerignore`: las capturas contienen
nombres y cédulas de los participantes.

## CLI

```bash
npm run start:cli -- \
  --scenario "Cancha polideportiva Carpinelo" \
  --division "Completa" \
  --date 2026-08-28 \
  --start 18:00 \
  --end 19:00
```

Añade `--confirm` para crear la reserva real.

## Docker

SIMON está detrás de Radware Bot Manager, que redirige a Chromium headless a una
página de desafío y el login nunca encuentra su formulario. Por eso la imagen
corre un navegador real contra un display virtual (`xvfb-run`) con `HEADED=true`,
en vez de falsear el user agent.

**El contenedor necesita un proceso init.** `xvfb-run` se queda esperando para
siempre la señal `USR1` de Xvfb cuando corre como PID 1, y `node` nunca arranca:
el contenedor queda "Up" pero sin responder y sin logs. Compose ya lo trae con
`init: true`; con `docker run` hay que pasar `--init`.

### Con Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

### Con `docker run`

```bash
docker build -t simon-reservas .
docker run --rm --init -p 3000:3000 --env-file .env simon-reservas
```

## Pruebas

```bash
npm run check
```

## Límites deliberados

- No automatiza pagos, CAPTCHA ni pasos manuales.
- No guarda cookies, perfiles ni credenciales en el repositorio. Los diagnósticos
  de `debug/` quedan fuera de Git y con las credenciales redactadas.
- No reserva en bucle ni sondea agresivamente SIMON.
- La reserva real solo ocurre con `confirm=true`.
