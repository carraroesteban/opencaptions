# Día del evento — runbook de producción (español)

> Versión en inglés y más detallada: [runbook.md](runbook.md). Seguridad: [../security-guide.md](../security-guide.md). Problemas: [troubleshooting.md](troubleshooting.md).

Guía para operar OpenCaptions en una conferencia con varias salas en paralelo (pensada para Nerdearla).
Objetivo: **cero operadores dedicados durante las charlas**. Una persona de producción mira el panel y actúa solo si aparece una alerta.

```
 Consola de sonido ──3.5 mm──► Mini PC de la sala (Chrome)
                                 ├─ /ingest.html   → manda el audio al server (WebSocket)
                                 └─ /screen.html   → pantalla/proyector de la sala (subtítulos + QR)
                                          │
                               Server OpenCaptions (VM o notebook, HTTPS)
                                 ├─ Gemini Live Translate (1 sesión por sala)
                                 ├─ Gemini Flash-Lite (traducción de subtítulos)
                                 └─ /admin.html    → panel de producción
                                          │
       Público (celu, QR → /s/<sala>)   vMix/OBS (/overlay.html)   Transcripciones SRT/VTT/TXT
```

---

## T‑1 día: preparar el server

1. **Server**: una VM chica (2 vCPU / 2 GB alcanzan para 10+ salas) o una notebook dedicada.
   ```bash
   git clone https://github.com/carraroesteban/opencaptions && cd opencaptions
   npm install && npm run setup # asistente: evento, salas, idiomas, API key, tokens
   docker compose up -d         # o: npm install && npm start
   ```
2. **HTTPS (obligatorio para usar micrófonos desde otras máquinas).** Los navegadores solo permiten capturar audio en `localhost` o `https://`. Opciones, de la más rápida a la más prolija:
   - **Cloudflare Tunnel** (sin abrir puertos, sirve también para el celu del público):
     `cloudflared tunnel --url http://localhost:8080` → te da `https://xxxx.trycloudflare.com`. Para el evento usá un *named tunnel* con dominio propio (ej. `subs.nerdearla.com`).
   - **Caddy** con dominio propio delante del server: `caddy reverse-proxy --from subs.nerdearla.com --to localhost:8080` (certificado automático, WebSockets incluidos).
   - **Red local sin internet**: `mkcert` → `HTTPS_CERT=… HTTPS_KEY=… npm start` (hay que instalar la CA de mkcert en cada mini PC).
   - Último recurso para una mini PC: lanzar Chrome con
     `--unsafely-treat-insecure-origin-as-secure=http://IP-DEL-SERVER:8080 --user-data-dir=/tmp/oc`.
   Poné la URL final en `PUBLIC_URL` (es la que aparece en los QR).
   **Nunca abras puertos del router hacia la mini PC ni hacia el server**: el túnel o la VM en la nube hacen que todo sea saliente por el puerto 443.
   **Tokens (seguridad).** Por defecto (`AUTH=auto`) la máquina del server confía solo en sí misma (`localhost`); cualquier otro dispositivo necesita token. Si no definís `ADMIN_TOKEN` / `INGEST_TOKEN`, se generan solos y se imprimen al arrancar (quedan en `data/secrets.json`). Para el evento definilos vos (`openssl rand -base64 24`) y:
   - el **panel** desde otra PC: abrir una vez `https://<server>/admin.html?token=<ADMIN_TOKEN>` (el token se guarda en ese navegador y se borra de la barra de direcciones);
   - cada **mini PC**: `--token <INGEST_TOKEN>` en el agente, o `?token=` la primera vez en `/ingest.html`;
   - el público, el proyector y el overlay **no** necesitan token.
3. **Facturación y cuotas**: billing activo en Google AI Studio (el free tier limita traducciones por minuto). Configurá una **alerta de presupuesto**. Revisá en AI Studio → *Rate limits* las sesiones Live concurrentes de tu tier; si hay más salas que el límite, repartí salas entre 2 API keys/proyectos (`STAGES=…` por instancia, ver README → Scaling).
4. **Salas** en `config/event.json` (o desde el panel → *+ Sala*):
   - `source`: `"auto"` si los hosts o speakers cambian de idioma (presentación en español de una charla en inglés, Q&A bilingüe). Fijalo (`"en"`/`"es"`) solo si toda la charla es en un idioma. En los dos casos, si el speaker cambia de idioma cada pista lo sigue: quien lee en español ve español y quien lee en inglés ve inglés.
   - `targets`: idiomas de subtítulos (ej. `["es"]` para charlas en inglés, `["en"]` para charlas en español).
5. **Glosario** (`config/glossary.json` o panel → *Glosario*): nombres de speakers, sponsors, productos y siglas de la agenda. Se aplica en caliente, sin reiniciar.
6. **Ensayo general**:
   - `npm run loadtest -- --stages 10 --input samples/talk-en.wav` → 10 salas simultáneas, mirar el panel.
   - `/demo.html?v=<charla de YouTube>` → comparar voz vs. subtítulos con una charla real.
7. **Agenda**: panel → *📅 Agenda* → pegar CSV `sala,hora,título,speaker` (ejemplo en `config/schedule.example.csv`). Cada charla toma su título y speaker sola; si el speaker anterior se pasa de tiempo, espera una pausa para no cortarlo.
8. **Imprimir los carteles QR**: panel → *🖨 Kit de QR* (`/kit.html`): un A4 bilingüe por sala. Revisá que el QR apunte a la dirección HTTPS pública (no a `localhost`).
9. **Anunciarlo** al inicio de cada charla: *"Subtítulos y traducción en vivo en tu celu: escaneá el QR. ¿Llegaste tarde? Tocá ✨ ¿Qué me perdí?"*

## T‑2 h: armar cada sala

Hay tres formas de llevar el audio de cada sala al server; elegí una por sala:

| Opción | Cuándo | Hardware por sala |
|---|---|---|
| **A. Pull del stream** (recomendada si vMix/OBS ya emite) | La consola ya entra a vMix/OBS | **Ninguno**: en el panel → ⚙︎ de la sala → *Pull de audio* `srt://…` / `rtmp://…` / `https://…m3u8` (un HLS en la red local requiere `PULL_ALLOW_PRIVATE=1`) |
| **B. Agente nativo** (recomendada con mini PC) | Audio por cable a una PC | Mini PC con Linux/macOS/Windows, **sin navegador**: `scripts/agent.js` como servicio del sistema |
| C. Página de ingesta en Chrome | Setup rápido / de emergencia | Cualquier PC con Chrome |

**B. Agente nativo** (sin navegador, arranca solo, reconecta solo):
```bash
node scripts/agent.js --list-devices                       # ver entradas de audio
node scripts/agent.js --stage sala-a --device 1 --server wss://<server> --token <INGEST_TOKEN>
```
Como servicio: Linux → `deploy/opencaptions-agent@.service` (systemd, uno por sala); macOS → `deploy/com.opencaptions.agent.plist` (launchd); Windows → `nssm install OpenCaptionsAgent node scripts\agent.js --stage sala-a --device "Nombre de la placa"`. Cada 5 s imprime vúmetro, estado de la sesión y latencia (`journalctl -u opencaptions-agent@sala-a -f`). Opciones: `--channel left|right` si la consola manda cosas distintas por cada canal, `--gain 1.5`.

**C. Página de ingesta en Chrome:**

1. Conectar la salida de la consola (3.5 mm / placa USB) a la mini PC.
2. Abrir en Chrome: `https://<server>/ingest.html?stage=<sala>&token=<INGEST_TOKEN>`
   - Elegir **Entrada** (la placa), **Canal** (mono / L / R según venga la consola), tildar **Auto‑iniciar**.
   - Para kiosco: `chrome --kiosk --autoplay-policy=no-user-gesture-required --use-fake-ui-for-media-stream "https://<server>/ingest.html?stage=<sala>&autostart=1"` (arranca solo tras un reinicio y acepta el permiso de micrófono).
3. **Estilo de los subtítulos**: diseñarlo una vez en `https://<server>/style.html` (tipografía, colores, caja/contorno, posición, líneas, mayúsculas, presets) y copiar las URLs generadas para overlay y proyector.
4. Segunda salida de video → `https://<server>/screen.html?stage=<sala>` (o la URL del editor de estilo) en pantalla completa (reemplaza la ventana del SaaS actual). Opciones: `&langs=es,orig`, `&size=7` (alto de letra en % de pantalla), `&qr=0`.
5. **Stream (vMix)**: input *Web Browser* 1920×1080 con `https://<server>/overlay.html?stage=<sala>&lang=es` como overlay del programa. En OBS: *Browser Source* con la misma URL. Un overlay por idioma/stream. Con chroma: `&bg=%2300ff00&style=outline`.

## T‑60 min: prueba de sonido (por sala)

Con alguien hablando al micrófono del escenario (o con `/demo.html?mode=mic` y un mic de mano):

- [ ] En `/ingest.html`: el **vúmetro** se mueve con la voz, sin llegar al rojo (ajustar *Ganancia*).
- [ ] En el panel `/admin.html`: la sala pasa a **EN VIVO**, chips de sesión en verde (`es · live`).
- [ ] Aparece texto en *Original* y en la traducción en menos de ~5 s.
- [ ] `/screen.html` en el proyector muestra los subtítulos y el QR se lee desde el fondo de la sala.
- [ ] Escanear el QR con un celu → elegir idioma → llegan los subtítulos.
- [ ] En vMix se ve el overlay sobre el programa.
- [ ] Silencio 30 s → la sala pasa a **EN PAUSA · silencio** (no consume). Hablar → vuelve sola.

## Durante las charlas

No hay que tocar nada. El sistema:
- pausa el envío al modelo con 30 s de silencio y retoma solo (con 600 ms de pre‑roll para no cortar la primera palabra);
- cierra las sesiones de IA tras 5 min sin voz y **separa la transcripción en una charla nueva** cuando vuelve la voz;
- renueva la sesión de Gemini antes de su límite (~10 min) sin perder audio;
- reinicia una sesión si hay voz pero no llega texto durante 20 s (watchdog);
- si la traducción de texto queda limitada por cuota, usa temporalmente la traducción de Live Translate.

Opcional: panel → *＋ Nueva charla* con el título (queda en el nombre de los archivos exportados y en la pantalla).

### Alertas del panel y qué hacer

| Alerta | Qué significa | Acción |
|---|---|---|
| **SIN INGESTA** | La mini PC no está mandando audio | Revisar que `/ingest.html` esté abierto y en *Enviando*. Si se reinició la PC y tiene autostart, vuelve sola. |
| **no llega audio** | Hay conexión pero no llegan paquetes | Red de la mini PC; recargar `/ingest.html`. |
| **¿mic muteado?** | 60 s de señal casi nula | Fader de la consola / cable 3.5 mm / entrada equivocada en *Entrada*. |
| **reconectando IA** | La sesión de Gemini se está reconectando | Esperar ~5 s; si persiste, botón **↻** de la sala. El audio de mientras queda en buffer (12 s). |
| **latencia alta** | Transcripción > 6 s detrás | Normal unos segundos tras reconectar; si persiste, **↻**. Revisar la red del server. |
| **traducción limitada por cuota** | 429 en Flash‑Lite | Automático (usa Live). Si es frecuente: subir tier o `MT_PARTIAL_MS=3000`. |
| Términos mal escritos | Nombres / siglas | Panel → *Glosario* → agregar reemplazo. Se aplica al instante. |
| Idioma equivocado | La charla es en otro idioma del configurado | Panel → ⚙︎ de la sala → *Idioma de la charla* (o `auto`). |

### Plan B

| Falla | Qué pasa | Qué hacer |
|---|---|---|
| Se corta internet de una sala | La mini PC guarda hasta ~15 s y reenvía al volver | Si dura más, hotspot 4G a la mini PC. |
| Se corta internet del server | Sin traducción hasta que vuelva; las páginas reconectan solas | Server en la nube (no en el venue) evita esto. |
| Se reinicia el server | Las pantallas, celulares y mini PCs reconectan solos; las transcripciones ya guardadas quedan en `data/` | `docker compose restart` / `npm start`. |
| Se cuelga Chrome en la mini PC | Sin audio de esa sala | Reabrir la URL; con `--kiosk` + autostart arranca solo. |
| Gemini caído o sin crédito | Se detienen los subtítulos; el panel muestra el error por sala y el server reintenta solo | Revisar estado/crédito en AI Studio. A futuro: motor local con Gemma (los motores son intercambiables, ver README → Project layout). |

## Al cierre de cada día

- El público tiene todas las transcripciones en `/talks.html` (leer, buscar, resumen, descargar).
- Panel → **⬇ Transcripciones** por sala → SRT/VTT para subir con los videos a YouTube, TXT para el blog/accesibilidad.
- Backup de `data/` (transcripciones JSONL por charla).
- Revisar el costo del día en el panel (*Costo estimado*) y en AI Studio → Usage.

## Referencia rápida de URLs

| Para | URL |
|---|---|
| Público (QR) | `/s/<sala>` |
| Transcripción en vivo | `/talk.html?stage=<sala>` |
| Biblioteca de transcripciones | `/talks.html` |
| Carteles QR | `/kit.html` |
| Salas | `/` |
| Proyector | `/screen.html?stage=<sala>` |
| Overlay vMix/OBS | `/overlay.html?stage=<sala>&lang=es` |
| Ingesta (mini PC) | `/ingest.html?stage=<sala>&token=<INGEST_TOKEN>&autostart=1` (el token se guarda la primera vez) |
| Producción | `/admin.html` |
| Prueba de sonido / demo en vivo | `/demo.html?mode=mic&stage=<sala>` |
| Demo con video de YouTube | `/demo.html?v=<url>` |
| Editor de estilo de subtítulos | `/style.html` |
| Agente nativo (sin navegador) | `node scripts/agent.js --stage <sala> --device <n>` |
| Métricas Prometheus | `/metrics` (requiere `Authorization: Bearer <ADMIN_TOKEN>`) |
