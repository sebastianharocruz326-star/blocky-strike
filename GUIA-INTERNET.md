# Subir Blocky Strike a internet (GitHub + Render, gratis)

**Resultado:** una dirección como `https://blocky-strike.onrender.com` donde tú y tus amigos juegan desde cualquier lugar, sin estar en el mismo Wi-Fi. Esa misma dirección se usará después para la Microsoft Store (paso 7), así que guárdala.

**Tiempo:** unos 20–30 minutos la primera vez. **Necesitas:** un correo, un navegador y la carpeta `blocky-strike` ya descomprimida en tu PC.

> Los datos del plan gratis y los campos de Render los verifiqué en la documentación oficial de Render (noviembre de 2026). Lo que **no pude hacer** desde mi entorno es la subida real, así que si alguna pantalla se ve distinta a como la describo, sigue la idea y no te asustes.

---

## PARTE 1 — Subir los archivos a GitHub

GitHub es la «nube» donde se guarda el código; Render lo lee desde ahí.

1. Entra a https://github.com y crea una cuenta (**Sign up**). Confirma tu correo.
2. Arriba a la derecha pulsa **+** → **New repository**.
   - **Repository name:** `blocky-strike`
   - Elige **Public** (es lo más simple; el juego no tiene contraseñas ni secretos).
   - **No marques** «Add a README file».
   - Pulsa **Create repository**.
3. En la página del repositorio vacío busca el enlace **uploading an existing file** y púlsalo.
4. Abre en tu PC la carpeta `blocky-strike`, **entra a ella**, selecciona **todo su contenido** y arrástralo a la página de GitHub. Deben subir estos archivos y la carpeta `icons`:
   `index.html`, `game.js`, `shared.js`, `server.js`, `sw.js`, `manifest.webmanifest`, `package.json`, `render.yaml`, `PROGRESO.md`, `GUIA-INTERNET.md`, `.gitignore` y la carpeta `icons`.
   - ⚠️ **Los archivos deben quedar sueltos en la raíz.** No arrastres la carpeta `blocky-strike` entera ni el `.zip`. Si después ves en GitHub una carpeta llamada `blocky-strike` que contiene todo, Render no va a encontrar `package.json`.
   - No subas la carpeta `vendor` si existe: el servidor la crea solo.
5. Espera a que termine la barra de carga, baja y pulsa **Commit changes**.
6. Revisa que en la lista del repositorio se vean `package.json`, `server.js` y la carpeta `icons`.

## PARTE 2 — Crear el servidor en Render

1. Entra a https://render.com → **Get Started** y regístrate con tu cuenta de **GitHub** (es lo más fácil porque ya quedan conectadas).
2. En el panel pulsa **New +** → **Web Service**.
3. Conecta GitHub y dale permiso al repositorio `blocky-strike` (puedes darle permiso solo a ese). Selecciónalo.
4. Rellena el formulario:

   | Campo | Qué poner |
   |---|---|
   | Name | `blocky-strike` (tu dirección será `https://NOMBRE.onrender.com`; si el nombre está ocupado, Render te pedirá otro o le agregará letras) |
   | Language | **Node** |
   | Branch | `main` |
   | Region | **Virginia** u **Ohio** (de las que ofrece Render, son las más cercanas a Perú) |
   | Build Command | `npm install` |
   | Start Command | `node server.js` |
   | Instance Type | **Free** |

   En **Advanced** (opciones avanzadas) pon **Health Check Path:** `/health`.

5. Pulsa **Create Web Service**. Se abre una pantalla con el registro (**Logs**) y empieza a construir. Tarda unos minutos.
6. Cuando termine, el estado cambia a **Live** y arriba aparece tu dirección `https://….onrender.com`. En el registro debes ver `BLOCKY STRIKE listo` y `Three.js guardado en vendor/`.

> Si en algún momento Render te pide **tarjeta de crédito** para el plan Free, detente y cuéntamelo antes de seguir. La documentación no dice que la pida para crear un servicio gratis.

## PARTE 3 — Probarlo

1. Abre tu dirección `https://….onrender.com`. Debe aparecer el menú de Blocky Strike.
2. Escribe tu nombre → **Crear sala**. Te sale un código de 4 letras.
3. Abre **la misma dirección en tu celular** (con datos móviles, sin el Wi-Fi de tu casa), escribe el código y pulsa **Unirse**. Así confirmas que funciona por internet de verdad.
4. En Edge o Chrome aparece el botón **Instalar app** (ahora sí funciona porque la dirección es `https`).
5. Si hace rato que nadie entra, la primera vez verás «**Despertando el servidor…**» hasta aproximadamente un minuto. Es normal: el juego reintenta solo y entra cuando el servidor despierta.

## PARTE 4 — Qué esperar del plan gratis

Datos de la documentación de Render:

- **Se duerme** tras 15 minutos sin tráfico y tarda cerca de **1 minuto** en despertar. Mientras haya jugadores conectados enviando datos por WebSocket, se mantiene despierto.
- **750 horas por mes** por cuenta. Un servicio encendido todo el mes usa unas 744, o sea que alcanza. Si se agotan, los servicios gratis se suspenden hasta el mes siguiente. Dormido no gasta horas.
- **Ancho de banda de salida limitado.** La página no dice la cantidad: revísala en la sección **Billing** de tu panel. Si se agota sin método de pago, los servicios gratis se suspenden ese mes. *(Estimación mía, no de Render: una sala de 12 jugadores puede gastar unos 40 MB por jugador por hora.)*
- **Pueden reiniciarlo en cualquier momento.** Si pasa, los jugadores se desconectan y las salas se pierden (viven en la memoria del servidor).
- Render indica que el plan gratis **no es para producción**. Para una app en la tienda con muchos jugadores conviene después un plan de pago (precios en https://render.com/pricing).

## PARTE 5 — Actualizar el juego cuando cambie

Cuando recibas una versión nueva (paso 6, 7…):

1. En GitHub abre tu repositorio → **Add file** → **Upload files**.
2. Arrastra los archivos nuevos (los que tienen el mismo nombre reemplazan a los anteriores).
3. **Commit changes**. Render detecta el cambio y vuelve a construir solo (unos minutos). Si algo se ve viejo, recarga con **Ctrl + F5**. La app instalada se actualiza sola.

## Problemas comunes

| Síntoma | Qué hacer |
|---|---|
| Render dice que falló el *build* o que no encuentra `package.json` | Los archivos quedaron dentro de una subcarpeta. Vuelve a subirlos sueltos en la raíz (Parte 1, paso 4). |
| La página abre pero el juego no conecta | Espera 1–2 minutos y vuelve a intentar; revisa **Logs** en Render. |
| No aparece «Instalar app» | Solo sale en **Edge o Chrome** de PC y con `https`. |
| Tu amigo no entra a tu sala | Revisa que escriba las 4 letras del código y que use **la misma dirección** `onrender.com`. |
| Quieres cambiar la dirección | Se define con el nombre del servicio al crearlo. Cambiarla después es más complicado: avísame antes del paso 7. |

**Guarda tu dirección `https://….onrender.com`:** el paso 7 (Microsoft Store) la necesita.
