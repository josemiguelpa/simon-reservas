# simon-reservas

Servicio HTTP y CLI para automatizar reservas en SIMON 2.0 INDER con Playwright.

## Requisitos

- Node.js 20 o posterior.
- Credenciales válidas de SIMON en variables de entorno.

## Variables de entorno

```dotenv
SIMON_DOCUMENT_TYPE=Cédula de Ciudadanía
SIMON_DOCUMENT_NUMBER=TU_NUMERO_DE_DOCUMENTO
SIMON_PASSWORD=TU_CONTRASENA
# SIMON_ROLE=Nombre exacto del perfil

HOST=0.0.0.0
PORT=3000
```

## Instalación local

```bash
pnpm install
npx playwright install chromium
cp .env.example .env
```

## API HTTP

```bash
npm start
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

Sirve el servicio solo sobre una red de confianza: las contraseñas viajan en el
cuerpo del request.

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

### Con Docker Compose

```bash
cp .env.example .env
docker compose up --build
```

### Con `docker run`

```bash
docker build -t simon-reservas .
docker run --rm -p 3000:3000 --env-file .env simon-reservas
```

## Pruebas

```bash
npm run check
```

## Límites deliberados

- No automatiza pagos, CAPTCHA ni pasos manuales.
- No guarda cookies, perfiles ni credenciales en el repositorio.
- No reserva en bucle ni sondea agresivamente SIMON.
- La reserva real solo ocurre con `confirm=true`.
