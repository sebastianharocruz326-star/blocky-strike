# BLOCKY STRIKE — Guía de progreso

## Estado actual: v1.5.8 — gráficos mejorados, práctica bomba, granadas, espectador

- v1.5.8: materiales Standard, cielo en gradiente, suelo con textura, mejor iluminación/sombras, calidad Baja/Media/Alta en Opciones.
- v1.5.7: modo Práctica (bomba): bots en Alpha y Bravo, plantas/desactivas localmente, rondas automáticas.
- v1.5.6: granadas HE / flash / humo (teclas 7 8 9 o G). Compra en tienda (B). En solo las tienes gratis para practicar.
- v1.5.5: modo espectador al morir en multijugador (seguir compañeros, Espacio/clic para cambiar, ratón para girar).
- v1.5.4: marcas de bala en paredes, casquillos al disparar, explosión de bomba más grande; pitido de bomba que se acelera; tonos “Bomb planted / defused”.
- v1.5.3: menú de Opciones en pausa (sensibilidad del mouse y volumen, se guardan).
- v1.5.2: menú para elegir tono de piel (5 tonos); arreglado que el cuchillo no disparaba (el chequeo de munición bloqueaba el melee).
- v1.5.0: uniformes: Alpha con casco, chaleco, radio y kit de desactivación; Bravo con gorro, pañuelo, camuflaje y correaje.
- v1.4.0: menú para elegir cara; el chat (Enter) muestra el color del equipo.
- v1.3.0: menú para elegir skin (soldado o camiseta azul y blanca, se ve online); tecla V = ver tu personaje en tercera persona.
- v1.2.1: arreglado error de arranque (siteMarkers). v1.2.2: se puede disparar contra bots. v1.2.3: personajes con más detalle y JUGAR.bat cierra servidores viejos.

### Novedades v1.1
- **Modo Defuse completo**: Bravo (rojo) planta la bomba en sitios A/B; Alpha (azul) desactiva.
- Mantén **E** en el anillo naranja del site para plantar (~3.2 s) o junto a la bomba para desactivar (~5 s).
- Cuenta atrás de **40 s** al plantar; si explota ganan los atacantes; si se desactiva ganan los defensores.
- Si el portador muere, la bomba cae y otro atacante puede recogerla.
- **Recoil acumulativo** por arma (sube al ráfaga, se recupera al soltar).
- Anillos A/B visibles en el mapa; HUD con temporizador de bomba.

### Novedades v1.0


Novedades mayores respecto a v0.9:
- **Equipos Alpha (azul) / Bravo (rojo)** con spawns separados y sin fuego amigo.
- **Economía**: empiezas con $800, ganas dinero por kills/headshots y por ganar/perder rondas (con bonus de racha de derrotas).
- **Freeze time** (6 s) al inicio de cada ronda: no te puedes mover, sí mirar y comprar.
- **Menú de compra (tecla B)** en freeze y descanso: SMG, Rifle, Escopeta, Francotirador.
- **Sin respawn a mitad de ronda** (estilo CS clásico): si mueres, esperas a la siguiente ronda.
- **Cuchillo** (tecla 1) + 5 armas de fuego.
- **Precisión estilo CS**: muy preciso quieto / caminando; mucho spread al correr o saltar.
- **Marcador por equipos**, HUD con dinero y score Alpha-Bravo.
- Partidas a 12 rondas (MR12). Gana el equipo que elimina al otro o, al acabar el tiempo, el de más kills de equipo.

Controles nuevos: **B** comprar · **1** cuchillo · **2** pistola · **3** SMG · **4** rifle · **5** escopeta · **6** sniper.

## Cómo ejecutarlo (en una PC)

1. Instala Node.js (https://nodejs.org, versión LTS). No hay que instalar nada más (no uses `npm install`).
2. Descomprime la carpeta, abre una terminal dentro de ella.
3. Ejecuta:  `node server.js`  (la primera vez tarda unos segundos en guardar Three.js)
4. Abre `http://localhost:3000`, escribe tu nombre y pulsa **Crear sala**. Te sale un código de 4 letras.
5. Tus amigos (en tu misma red Wi-Fi) abren la dirección `http://192.168.x.x:3000` que muestra la terminal, escriben el código y pulsan **Unirse**.

### Probar la app instalable
Abre `http://localhost:3000` en **Edge o Chrome**. Aparece el botón «Instalar app» en el menú (también un ícono en la barra de direcciones). Solo funciona en `localhost` o en `https://`, no en `http://192.168.x.x`.

## Controles

W A S D mover · Espacio saltar · Shift caminar lento · Mouse apuntar · Clic izq. disparar ·
1 / 2 / 3 / 4 / 5 cambiar arma · Clic der. zoom (francotirador) · R recargar · Tab marcador · Enter chat · Esc pausa

## Ruta a la Microsoft Store

La idea: el juego ya es una PWA. Se sube el servidor a internet (HTTPS) y la herramienta gratuita **PWABuilder** (https://www.pwabuilder.com) convierte esa dirección en un paquete MSIX que se envía a la tienda.

- [x] **Paso 4 — App instalable (PWA)**
- [x] **Paso 5A — Salas con código**
- [x] **Paso 5B — Subir a internet:** guía + reintento al despertar  ← hecho (falta que tú hagas la subida)
- [ ] **Paso 6 — Acabado:** más mapas, armas, minimapa, rondas, silenciar chat
- [ ] **Paso 7 — Publicar:** política de privacidad, capturas, paquete MSIX, Partner Center

### Lo que puedes ir haciendo tú mientras tanto (sin código)
- Crear tu cuenta de desarrollador en **Partner Center** (https://partner.microsoft.com/dashboard). Según una nota de BetaNews (sept. 2025), Microsoft quitó la tarifa de registro para desarrolladores **individuales**; confírmalo ahí mismo, también el requisito de edad y la verificación de identidad.
- Reservar el nombre «Blocky Strike» en Partner Center (si ya está tomado, hay que cambiarlo).
- **No uses «Counter-Strike» ni imágenes, sonidos o mapas de Valve** en el nombre, la descripción ni el juego: es marca registrada y la tienda lo rechaza.
- **Seguir `GUIA-INTERNET.md`** para subirlo a internet con GitHub y Render, probarlo con un amigo y **guardar tu dirección `https://….onrender.com`** (el paso 7 la necesita).

### Prompts listos (uno por mensaje, en un chat NUEVO, adjuntando el .zip)

**PASO 6**
> Adjunto mi proyecto Blocky Strike (paso 5B terminado, ver PROGRESO.md; ya está subido a Render). Haz el PASO 6: 2 mapas nuevos con menú para elegir mapa al crear la sala (cada mapa con sus cajas, spawns y waypoints en shared.js, como el mapa dust), más armas, sonidos de pasos y recarga, minimapa, rondas con tiempo y marcador final, indicador visual de la protección al reaparecer, compensación de latencia en el servidor, y en el chat un botón para silenciar jugadores. Actualiza PROGRESO.md.

**PASO 7**
> Adjunto mi proyecto Blocky Strike (paso 6 terminado, ver PROGRESO.md). Haz el PASO 7: dejarlo listo para la Microsoft Store. Página de privacidad en español e inglés servida en /privacidad (el juego guarda el nombre que elige el jugador y mensajes de chat en memoria del servidor), capturas de pantalla en el manifest, y una guía paso a paso para: usar PWABuilder con mi dirección de Render para generar el paquete MSIX, crear la ficha en Partner Center (nombre, descripción en español e inglés, clasificación por edades, precio gratis, categoría Juegos) y enviarlo a certificación. Actualiza PROGRESO.md.

## Límites conocidos (para tenerlos presentes)

- **Sin compensación de latencia** hasta el paso 6: por internet con ping alto cuesta acertar a quien se mueve rápido.
- **Antitrampas básico:** el servidor valida disparos, daño, cadencia, munición y velocidad, pero no simula choques con paredes.
- **Los códigos de sala no son secretos:** quien adivine las 4 letras puede entrar. Sirven para agrupar amigos, no para proteger nada.
- **Render gratis (datos de su documentación):** se duerme tras 15 min sin tráfico y tarda ~1 min en despertar (con jugadores conectados se mantiene despierto); 750 horas al mes; ancho de banda de salida limitado (mira Billing); puede reiniciarse en cualquier momento y las salas se pierden. Render dice que no es para producción: para jugadores reales de la tienda conviene después un plan de pago.
- El paquete de la tienda abre tu dirección de Render: si el servidor está apagado, el multijugador no conecta (el modo solo sí funciona sin internet).
- La Microsoft Store revisa cada envío; puede tardar y pedir cambios.
- Las capturas de pantalla para la ficha las tienes que tomar tú en tu PC jugando (en el entorno donde se programa no se puede abrir el juego).

## Ajustes rápidos

- Modo solo: bloque `CFG` arriba de `game.js` (`bots`, `botDamage`, `botSpeed`, `botRespawn`).
- Armas, daño, vida y mapa: `shared.js` (lo usan el navegador y el servidor).
- Jugadores por sala, protección al reaparecer, límite de salas: arriba de `server.js` (`MAX_PLAYERS`, `PROTECT_MS`, `MAX_ROOMS`).
- Ícono: carpeta `icons/`. Nombre y colores de la app: `manifest.webmanifest`.

## Archivos

- `index.html`  pantalla, menú, HUD, marcador, chat y botón de instalar
- `game.js`     el juego en el navegador (gráficos, controles, bots, red)
- `shared.js`   mapa, armas y reglas compartidas con el servidor
- `server.js`   servidor web + salas + multijugador (WebSocket propio, sin dependencias)
- `sw.js`       service worker: instalación y modo sin internet
- `manifest.webmanifest`  datos de la app instalable
- `icons/`      íconos de la app
- `render.yaml` configuración para Render
- `GUIA-INTERNET.md`  guía paso a paso para subirlo a GitHub y Render
- `vendor/`     se crea solo al arrancar el servidor (Three.js). No hace falta subirlo
- `package.json`, `.gitignore`

## Cómo hablan el navegador y el servidor (resumen)

Mensajes JSON por WebSocket en `/ws`.
- Navegador → servidor: `join` (nombre y `create: true` o `room: "ABCD"`), `state` (posición, 20 veces/s), `shoot` (direcciones de las balas), `reload`, `ping`, `chat`
- Servidor → navegador: `welcome` (incluye `room`), `join`, `leave`, `state`, `shot`, `hit` (daño/muerte), `respawn`, `correct`, `scores`, `pong`, `chat`, y los errores `noroom`, `full`, `busy`

## Consejos para no quedarte sin mensajes gratis

- Pide un solo paso por mensaje y no hagas charlas largas en medio. Si un paso es muy largo, pídele a Claude que lo divida (como pasó con el 5).
- Si Claude se corta a la mitad, espera a que se renueve el límite, abre un chat nuevo, adjunta el .zip y escribe: «Continúa desde donde quedaste, ver PROGRESO.md».
- Si algo falla, abre la consola del navegador (F12 → Console) y pega el error completo en lugar de describirlo.
- Guarda una copia de la carpeta después de cada paso.

## Registro

- v0.1 — Paso 1: base jugable, mapa Dust Blocks, arma y blancos.
- v0.2 — Paso 2: bots con IA, daño y muerte del jugador, 3 armas, kill feed.
- v0.3 — Paso 3: multijugador con servidor que valida disparos, menú, marcador, chat y ping.
- v0.4 — Paso 4: app instalable (PWA), modo sin internet, íconos, Three.js local.
- v0.5 — Paso 5A: salas con código, enlace para compartir, límites del servidor, gzip.
- v0.6 — Paso 5B: reintento automático al despertar el servidor, render.yaml verificado, Node fijado en `package.json` (>=18 <25), GUIA-INTERNET.md.
- v0.7 — Paso 6A: selector de 3 mapas por sala, subfusil y francotirador con zoom.
- v0.8 — Paso 6B: rondas, minimapa, pasos y recarga, escudo, compensación de latencia, silenciar chat.
- v0.9 — Paso 7: política de privacidad (/privacidad) y guía de la tienda.
