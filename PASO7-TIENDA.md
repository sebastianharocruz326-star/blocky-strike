# Paso 7 — Publicar Blocky Strike en la Microsoft Store

Última revisión de requisitos: 5 de noviembre de 2026. Microsoft los cambia seguido: si algo no coincide con lo que ves en pantalla, manda lo que diga Partner Center.

## 0. Antes de empezar (importante)

- **Cuenta de desarrollador.** La cuenta individual es **gratis** si entras por **storedeveloper.microsoft.com** (por otros accesos puede aparecer el flujo antiguo, que cobra unos 19 USD). Pide verificar tu identidad con **documento de identidad oficial y selfie**, y el nombre de la cuenta debe coincidir exactamente con el del documento.
- **Edad.** En la documentación de Microsoft que revisé no encontré una edad mínima escrita, pero la cuenta se acepta con un contrato legal y verificación con tu propio documento. Si aún no eres mayor de edad, lo más seguro es **esperar a cumplir 18** o que tu mamá o papá abra la cuenta con su documento (el editor sería esa persona). Confírmalo en la pantalla de registro antes de pagar o subir documentos.
- **Servidor en línea.** Haz primero el Paso 5 (GitHub + Render, ver `GUIA-INTERNET.md`). Necesitas una dirección HTTPS pública, por ejemplo `https://blocky-strike.onrender.com`. En el plan gratis de Render el servidor se duerme cuando nadie lo usa y tarda en despertar: avisa en la descripción o considera un plan que no se duerma antes de enviar a revisión.
- **Nombre.** No uses "Counter-Strike" ni material de Valve en nada: nombre, capturas, descripción, íconos.

## 1. Rellena tu política de privacidad

Abre `privacidad.html` y reemplaza `[NOMBRE DEL EDITOR]` y `[TU CORREO]` (español e inglés). Al subirlo a Render quedará en `https://TU-APP.onrender.com/privacidad`. Esa es la dirección que pide la ficha de la tienda.

## 2. Reserva el nombre en Partner Center

1. Entra a Partner Center → **Apps y juegos** → **Nuevo producto** → **PWA o aplicación MSIX** (el nombre exacto puede variar) → reserva "Blocky Strike" (si ya está tomado, prueba "Blocky Strike Arena").
2. En tu app: **Administración de productos → Identidad del producto**. Copia estos tres datos: **Package ID**, **Publisher ID** y **Publisher display name**.

## 3. Prepara los paquetes con PWABuilder

1. Entra a **pwabuilder.com**, pega la dirección de tu juego y pulsa Start. Revisa el informe (el manifiesto y el service worker ya están hechos).
2. **Package for stores → Windows → Generate package**. Pega los tres datos del paso 2.
3. Descarga el zip. Dentro viene el paquete `.msixbundle` y las instrucciones para probarlo en tu PC.

## 4. Capturas de pantalla

No pude sacarlas por ti (no puedo abrir el juego). Hazlas tú:
- Juega en una ventana grande y usa **Win + Shift + S** (o la tecla Impr Pant).
- Saca **3 a 5 capturas** horizontales: menú, partida contra bots, partida online con el minimapa, el francotirador con zoom, el marcador de ronda.
- Partner Center te indica el tamaño exacto que acepta en la sección de capturas; usa capturas de pantalla completa para no tener que recortar.
- Mostrar solo tu juego: sin barra de tareas, sin nombres reales ni mensajes de chat de otras personas.

## 5. Ficha de la tienda (textos para copiar)

**Nombre:** Blocky Strike

**Descripción corta (resumen):**
Shooter 3D en primera persona con estilo de bloques. Practica contra bots o juega en línea con amigos.

**Descripción:**
Blocky Strike es un shooter 3D en primera persona con personajes y mapas hechos de bloques.

• 3 mapas: Dust Blocks, Almacén y Plaza Cruz.
• 5 armas: pistola, rifle, escopeta, subfusil y francotirador con zoom.
• Modo solo: practica contra bots, incluso sin internet.
• Modo en línea: crea una sala, comparte el código de 4 letras y juega con tus amigos.
• Partidas por rondas con marcador final, minimapa y chat.
• Protección al reaparecer y opción para silenciar jugadores en el chat.

Controles: WASD para moverte, mouse para apuntar, clic para disparar, clic derecho para el zoom del francotirador, R para recargar, 1 a 5 para cambiar de arma, Tab para el marcador y Enter para el chat.

**Novedades de esta versión:** Primera versión en la tienda.

**Palabras clave (hasta 7):** shooter, bloques, multijugador, fps, disparos, arcade, amigos

**Categoría:** Juegos → Disparos (o la más parecida que ofrezca Partner Center)

**Requisitos:** teclado y mouse. Conexión a internet solo para el modo en línea.

## 6. Clasificación por edad (IARC)

Partner Center te hace un cuestionario y calcula la clasificación. Responde con sinceridad; no intentes bajarla. Datos reales de tu juego:
- Violencia: disparos entre personajes de bloques, sin sangre realista.
- Interacción en línea: sí, hay chat entre jugadores y salas con código.
- Se muestra el apodo a otros jugadores; no hay ubicación, compras ni anuncios.
- Compras dentro de la app: ninguna. Precio: gratis.

## 7. Envío

1. En tu app → **Iniciar el envío**.
2. **Precios y disponibilidad:** gratis, los países que quieras.
3. **Propiedades:** categoría, y pega la dirección de la política de privacidad.
4. **Clasificación por edad:** el cuestionario del punto 6.
5. **Paquetes:** sube el `.msixbundle` de PWABuilder.
6. **Ficha de la tienda:** textos del punto 5 y tus capturas. Ícono: `icons/icon-512.png`.
7. **Enviar para certificación.** Suele tardar de 1 a 3 días. Si lo rechazan, el correo dice el motivo exacto; arregla eso y reenvía.

## 8. Después de publicar

- Cada vez que cambies el juego, sube los cambios a GitHub (Render se actualiza solo). El juego instalado desde la tienda carga desde tu servidor, así que normalmente **no hace falta enviar un paquete nuevo** salvo que cambies el ícono, el nombre o la ficha.
- Sube `VERSION` en `sw.js` en cada cambio para que los jugadores reciban la versión nueva.
