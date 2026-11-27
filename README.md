# RAPIDIN

**Tu pedido, tu precio, tu repartidor.**

RAPIDIN es una plataforma de delivery por ofertas para Camaná, Arequipa (Perú). El cliente publica lo que necesita, los repartidores envían ofertas y el cliente elige cuál aceptar.

## Estado

| Componente | Carpeta | Estado |
|---|---|---|
| Web pública | `web/` | Lista (demostración, sin backend) |
| Panel de cliente y Market | `web/` (`#cliente`) | Listo en modo demostración |
| Panel de repartidor y postulación | `web/` (`#repartidor`) | Listo en modo demostración |
| Panel administrativo | `web/` (`#admin`) | Listo en modo demostración. En producción será un sitio aparte |
| Backend Firebase (Functions, reglas) | `firebase/` | Pendiente |
| App cliente «Rapidin Delivery» (Flutter) | `apps/rapidin_delivery/` | Pendiente |
| App repartidor «Rapidin Repartidor» (Flutter) | `apps/rapidin_repartidor/` | Pendiente |

## Modo demostración

Todo funciona **sin Firebase**: los datos se guardan en el navegador (localStorage) y las reglas de negocio se ejecutan en `web/js/demo/api.js`, con los mismos nombres que tendrán las Cloud Functions. No se envían SMS ni correos y no se suben archivos.

### Cuentas de prueba

Contraseña de todas: **`Rapidin123`**. En la ventana «Ingresar» hay botones para entrar con un clic.

| Rol | Correo | Qué puedes probar |
|---|---|---|
| Cliente | `cliente@rapidin.test` | Comprar en el Market, pedido libre, aceptar ofertas, pagar, seguir en el mapa, calificar, billetera, direcciones |
| Repartidor | `repartidor@rapidin.test` | Estar disponible, Guía de precios, ofertar, avanzar estados, confirmar pagos, billetera y retiros |
| Postulante | `postulante@rapidin.test` | Ver el estado de una postulación pendiente |
| Administrador | `admin@rapidin.test` | Locales, horarios y catálogo del Market, aprobar repartidores, recargas, retiros, comisiones, configuración, auditoría |

También puedes **crear una cuenta nueva**: el código de verificación del SMS aparece en pantalla.

### Market

- El administrador registra cada local con sus **días y horario de atención** (hora de Lima) y activa «Vende en el Market».
- En **Establecimientos → Catálogo** carga los productos con el **precio del local**, sección, descripción y foto opcional, y puede marcarlos como agotados.
- El cliente solo puede comprar cuando el local está **abierto**. Arma su carrito (un local por pedido), elige dirección y medio de pago y confirma.
- Los repartidores ven los productos y el precio del local **fijo**; solo ofertan su **tarifa de envío**. El cliente compara y elige.
- Los precios se toman siempre del catálogo en el servidor, nunca de lo que envía el navegador.

### Comisión de compra libre

- **6 % del total de la oferta**, con mínimo S/ 1.50 y máximo S/ 6 (editable en Admin → Comisiones).
- Se calcula sobre el total que paga el cliente, así no conviene mover dinero del envío a los productos. Lo que el repartidor ahorre comprando más barato es suyo.
- Market y tienda específica siguen con la tabla por distancia.

### Tema claro / oscuro

- Botón de luna/sol en la barra superior de los paneles y opción Claro / Oscuro / Sistema en el menú del usuario. Se recuerda en el dispositivo. La web pública sigue en tema claro.

### Entrega confirmada por el cliente

- El repartidor toca **«Entregué el pedido»** sin subir foto ni comprobante. El pedido queda en **«Entregado · por confirmar»**.
- El cliente toca **«Sí, lo recibí»** y recién ahí se cierra el pedido y se cobra la comisión. Si responde **«No lo recibí»**, pasa a revisión y el admin decide (confirmar o cancelar).
- Si el cliente no responde en 30 minutos (Configuración: `autoConfirmarMin`), se confirma automáticamente.

### Datos iniciales

- Solo cuentas de prueba (cliente, repartidor, admin) y el primer local real: **Puerto en Llamas by Ala Ruta** (Jr. Puente Grau #281, esquina con Dos de Mayo · -16.624167, -72.712889 · jueves a domingo de 19:00 a 22:30 · 981 157 504) con su carta completa.
- Sin pedidos, reseñas, guía de precios ni solicitudes de ejemplo. La actividad simulada viene apagada.

### Pedido en curso: pago, chat y contacto

- **Pago directo sin comprobantes:** el cliente copia el Yape/Plin/Lemon del repartidor, paga y toca **«Ya pagué»**. No envía código ni captura. El repartidor confirma «Sí, recibí el pago» (o «Aún no me llega»).
- **Chat del pedido** entre cliente y repartidor, con respuestas rápidas y contador de no leídos. El administrador lo ve en el detalle del pedido.
- **Llamar y WhatsApp** como botones en todo el sistema.
- **Foto de perfil:** obligatoria para postular como repartidor; se ve en ofertas, pedido y chat.

### Market por especialidades y calificaciones

- Cada local tiene hasta 4 especialidades (pollo a la brasa, broaster, chifa, pizzas…) que el admin elige.
- El Market muestra categorías con ícono, ranking «Mejor calificados», orden y filtro de abiertos.
- Al recibir el pedido, el cliente califica al repartidor y al local; la reseña aparece en la página del local.

### Registro de negocios

- En el inicio hay un botón **«¿Tienes un negocio en Camaná?»**, una sección **Para negocios** y enlaces en el menú, el contacto y el pie.
- El dueño llena nombre, rubro, responsable, celular, dirección, horario, **logo y portada** (opcionales) y marca la ubicación. No necesita cuenta.
- La solicitud llega al **panel administrativo → Negocios nuevos** (con contador y aviso en la campana) y el negocio puede enviar el aviso por **WhatsApp al 916 252 754** con un mensaje ya escrito que incluye el enlace de Google Maps del local. El número se cambia en `web/js/config.js` (`adminWhatsapp`).
- Al pulsar **Revisar y aprobar**, se abre el formulario del establecimiento con todos los datos, imágenes y ubicación precargados.
- En producción el aviso por WhatsApp al administrador lo envía una Cloud Function (WhatsApp Business Cloud API), sin depender del usuario.

### Ubicación de locales

Al registrar o editar un local (admin, guía de repartidores y formulario público) hay cuatro formas de marcar la ubicación:
1. **Escribir la dirección**: con Google Maps activo, la busca con la Geocoding API dentro de Camaná y muestra opciones si hay varias. Sin API key, abre Google Maps con esa dirección para copiar el enlace.
2. **Usar mi ubicación** (GPS del celular), ideal estando en el local.
3. **Pegar un enlace largo o coordenadas** copiadas de Google Maps.
4. **Tocar el mapa** para afinar el punto exacto.
Siempre aparece «Confirmar en Google Maps ↗» para verificar el punto.

### Logo y portada

Cada establecimiento puede tener **logo** (cuadrado, se recorta a 256 px) y **portada** (horizontal, 960 × 480 px). Se muestran en el Market del inicio, en el Market del cliente, en la página del local y en el panel. En la demo se guardan reducidas en el navegador; en producción se suben a Firebase Storage.

### Guía de precios para repartidores

Es distinta del Market y el cliente no la ve. Sirve para cotizar pedidos de **compra libre**:
- El administrador agrega locales en **Guía repartidor** con su teléfono, días y horario, si aceptan pedidos por teléfono y notas, y carga **precios de referencia** por producto. Puede marcar todos los precios como «revisados hoy» después de llamar al local.
- El repartidor busca un producto (por ejemplo «gaseosa 3 L») y ve dónde está más barato, si el local está abierto y su teléfono para pedir y pasar a recoger.
- Al ofertar en una compra libre, la calculadora sugiere productos según lo que pidió el cliente y suma el costo automáticamente.
- En sus entregas de tienda o Market, el repartidor ve el teléfono del local para pedir antes de llegar.

### Actividad simulada

Para probar sola o solo una persona, hay repartidores y clientes simulados:
- Cuando un cliente publica un pedido, los repartidores simulados envían ofertas a los pocos segundos y, si aceptas una, avanzan el pedido hasta la entrega.
- Los clientes simulados publican pedidos para que el repartidor de prueba tenga trabajo, aceptan su oferta, pagan y califican.

Se desactiva en **Admin → Configuración → Actividad simulada**. Para volver a los datos iniciales: menú de usuario → **Restablecer datos de demo**.

Consejo: abre dos pestañas (una como cliente y otra como repartidor) para ver el ciclo completo en tiempo real.

## Estructura de la web

```
web/
├── index.html            Web pública + contenedor de la aplicación
├── css/styles.css        Estilos de la web pública (colores de marca en :root)
├── css/app.css           Estilos de los paneles
├── js/main.js            Web pública: navegación, calculadora, diálogos
├── js/scene3d.js         Escena 3D del inicio (Three.js r128)
├── js/app.js             Aplicación: rutas (#cliente, #repartidor, #admin), sesión, barra lateral
├── js/auth.js            Ingreso, registro y verificación del celular
├── js/config.js          Configuración pública: API key de Google Maps, Map ID, zona
├── js/map.js             Mapas: Google Maps si hay API key; si no, mapa referencial
├── js/location.js        Campo de ubicación: dirección escrita, GPS, enlace de Google Maps o tocar el mapa
├── js/business.js        Formulario público «Registra tu negocio» y aviso por WhatsApp
├── js/ui.js              Utilidades de interfaz
├── js/panels/            cliente.js, repartidor.js, admin.js, common.js
├── js/demo/store.js      Datos de demostración (se reemplaza por Firestore)
├── js/demo/api.js        Reglas de negocio (se reemplazan por Cloud Functions)
├── js/demo/sim.js        Actividad simulada (solo demo)
└── assets/               Logos (ver «Logos»)
```

### Paso a Firebase

Los paneles solo hablan con `demo/api.js` y `demo/store.js`. Para conectar Firebase se reemplazan esos dos archivos por:
- Firebase Authentication (correo + verificación del celular por SMS).
- Firestore con las mismas colecciones (`users`, `couriers`, `orders`, `wallets`, `walletLedger`, `topups`, `withdrawals`, `commissionRules`, `config`, `establishments`, `zones`, `auditLog`…).
- Cloud Functions con los mismos nombres (`createOrder`, `submitOffer`, `acceptOffer`, `advanceOrderState`, `confirmTopup`…).
- Google Maps en lugar del mapa referencial.

## Conectar Google Maps

La web ya está preparada: si `web/js/config.js` tiene una API key, usa Google Maps; si está vacía o la key falla, usa el mapa referencial.

1. En [Google Cloud Console](https://console.cloud.google.com/), usa el mismo proyecto de Firebase (`rapidin-dev`) con la facturación activa.
2. **APIs y servicios → Biblioteca**, habilita:
   - **Maps JavaScript API** (web).
   - **Maps SDK for Android** y **Maps SDK for iOS** (cuando hagamos las apps).
   - **Geocoding API** (para buscar la dirección escrita de un local y ubicarla en el mapa).
   - **Places API (New)** (más adelante, para sugerencias mientras se escribe).
   - **Routes API** (solo la usarán las Cloud Functions para calcular la ruta una vez por pedido).
3. **APIs y servicios → Credenciales → Crear credenciales → Clave de API**. Edítala:
   - **Restricción de aplicación: Sitios web**, agrega `https://streamsvip.github.io/*` y `http://localhost:*/*` (luego tu dominio).
   - **Restricción de API:** solo *Maps JavaScript API* y *Geocoding API* (y *Places API (New)* cuando la usemos).
4. **Google Maps Platform → Administración de mapas → Crear ID de mapa** (tipo JavaScript, vectorial). En **Estilos de mapa** crea un estilo con los colores de RAPIDIN y asócialo a ese ID.
5. **Cuotas:** en *Maps JavaScript API → Cuotas*, pon un límite diario de cargas de mapa (por ejemplo 300 al día) para no salir del uso gratuito mientras pruebas.
6. Pega la key y el Map ID en `web/js/config.js`, sube el cambio a GitHub y listo.

Las vistas reutilizan cada mapa mientras está abierto para no cobrar una carga nueva cada vez que se mueve el repartidor. La vista previa de Claude no puede cargar Google Maps (bloquea scripts externos); pruébalo en GitHub Pages o en tu PC.

## Logos

Copia en `web/assets/` (imágenes cuadradas de 128 × 128 px o más):

| Archivo | Uso |
|---|---|
| `rap.png` | Logo de RAPIDIN |
| `yape.png` | Medio de pago Yape |
| `plin.png` | Medio de pago Plin |
| `lemon.png` | Medio de pago Lemon |
| `wallet.png` | Saldo RAPIDIN |

Si falta alguno, la web muestra una insignia de color con la inicial.

## Ver la web en tu computador

La web usa módulos de JavaScript, así que **no funciona abriendo `index.html` con doble clic**. Hay que servirla:

- **VS Code:** extensión *Live Server* → clic derecho en `web/index.html` → «Open with Live Server».
- **Node.js:** `npx serve web`.
- **Python:** `cd web` y `python -m http.server 8080`, luego abre http://localhost:8080.

## Publicar

- **GitHub Pages:** `.github/workflows/pages.yml` publica la carpeta `web/` en cada cambio a `main`.
- **Firebase Hosting (más adelante):** `firebase.json` ya apunta a `web/`.

## Seguridad

- Nunca subas credenciales al repositorio. `.gitignore` excluye `.env` y claves de servicio.
- La configuración web de Firebase (apiKey, etc.) no es secreta, pero la API key debe quedar restringida por dominio en Google Cloud.
- La contraseña de prueba y los datos simulados existen solo en esta demostración.

## Marca

| Token | Color |
|---|---|
| Naranja principal | `#FF5A1F` |
| Azul noche | `#101C2C` |
| Turquesa | `#20C997` |
| Crema | `#FFF7ED` |
| Blanco | `#FFFFFF` |

Tipografías: Archivo (títulos) y Onest (texto), desde Google Fonts.
