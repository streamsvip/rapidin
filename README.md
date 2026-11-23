# RAPIDIN

**Tu pedido, tu precio, tu repartidor.**

RAPIDIN es una plataforma de delivery por ofertas para Camaná, Arequipa (Perú). El cliente publica lo que necesita, los repartidores envían ofertas y el cliente elige cuál aceptar.

## Estado

| Componente | Carpeta | Estado |
|---|---|---|
| Web pública | `web/` | Lista (demostración, sin backend) |
| Panel de cliente | `web/` (`#cliente`) | Listo en modo demostración |
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
| Cliente | `cliente@rapidin.test` | Pedir, comparar y aceptar ofertas, pagar, seguir en el mapa, calificar, billetera |
| Repartidor | `repartidor@rapidin.test` | Estar disponible, ofertar, avanzar estados, confirmar pagos, billetera y retiros |
| Postulante | `postulante@rapidin.test` | Ver el estado de una postulación pendiente |
| Administrador | `admin@rapidin.test` | Aprobar repartidores, verificar recargas, pagar retiros, comisiones, configuración, auditoría |

También puedes **crear una cuenta nueva**: el código de verificación del SMS aparece en pantalla.

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
├── js/map.js             Mapa referencial de Camaná (se reemplaza por Google Maps)
├── js/ui.js              Utilidades de interfaz
├── js/panels/            cliente.js, repartidor.js, admin.js, common.js
├── js/demo/store.js      Datos de demostración (se reemplaza por Firestore)
├── js/demo/api.js        Reglas de negocio (se reemplazan por Cloud Functions)
├── js/demo/sim.js        Actividad simulada (solo demo)
└── assets/rap.png        Logo
```

### Paso a Firebase

Los paneles solo hablan con `demo/api.js` y `demo/store.js`. Para conectar Firebase se reemplazan esos dos archivos por:
- Firebase Authentication (correo + verificación del celular por SMS).
- Firestore con las mismas colecciones (`users`, `couriers`, `orders`, `wallets`, `walletLedger`, `topups`, `withdrawals`, `commissionRules`, `config`, `establishments`, `zones`, `auditLog`…).
- Cloud Functions con los mismos nombres (`createOrder`, `submitOffer`, `acceptOffer`, `advanceOrderState`, `confirmTopup`…).
- Google Maps en lugar del mapa referencial.

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
