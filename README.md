# RAPIDIN

**Tu pedido, tu precio, tu repartidor.**

RAPIDIN es una plataforma de delivery por ofertas para Camaná, Arequipa (Perú). El cliente publica lo que necesita, los repartidores envían ofertas y el cliente elige cuál aceptar.

## Estado

| Componente | Carpeta | Estado |
|---|---|---|
| Web pública | `web/` | Interfaz lista (demostración, sin backend) |
| Panel administrativo | `admin/` | Pendiente |
| App cliente «Rapidin Delivery» (Flutter) | `apps/rapidin_delivery/` | Pendiente |
| App repartidor «Rapidin Repartidor» (Flutter) | `apps/rapidin_repartidor/` | Pendiente |
| Backend Firebase (Functions, reglas) | `firebase/` | Pendiente |

En la web, el pedido, el inicio de sesión, la postulación y el contacto son simulaciones. No envían datos todavía. Se conectarán a Firebase (proyecto `rapidin-dev`) en la siguiente fase.

## Estructura de la web

```
web/
├── index.html          Página principal
├── css/styles.css      Estilos (colores de marca en :root)
├── js/main.js          Navegación, calculadora, diálogos y flujos de demostración
├── js/scene3d.js       Escena 3D del inicio (Three.js r128)
└── assets/rap.png      Logo (cópialo aquí)
```

## Logo

Copia tu logo como `web/assets/rap.png` (cuadrado, fondo transparente, 256 × 256 px o más). Se usa en la barra superior, el pie de página y como ícono de la pestaña. Si el archivo no está, la web muestra un logo vectorial de respaldo.

## Ver la web en tu computador

La web usa módulos de JavaScript, así que **no funciona abriendo `index.html` con doble clic**. Hay que servirla con un servidor local:

- **VS Code:** instala la extensión *Live Server*, abre la carpeta `web/` y haz clic en «Go Live».
- **Node.js:** desde la carpeta del repositorio, ejecuta `npx serve web` y abre la dirección que aparece.
- **Python:** `cd web` y luego `python -m http.server 8080`, y abre http://localhost:8080.

## Subir a GitHub

```bash
cd rapidin
git init
git add .
git commit -m "Web pública RAPIDIN: interfaz inicial con escena 3D"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/rapidin.git
git push -u origin main
```

Crea antes el repositorio vacío en GitHub (sin README) con el nombre `rapidin`. Te recomendamos que sea **privado**.

## Publicar en Firebase Hosting (más adelante)

`firebase.json` ya apunta a la carpeta `web/`. Cuando exista el proyecto `rapidin-dev`:

```bash
npm install -g firebase-tools
firebase login
firebase use --add        # elige rapidin-dev
firebase emulators:start  # prueba local
```

No publiques nada en producción hasta definir el nombre y el dominio finales.

## Seguridad

- Nunca subas credenciales al repositorio. `.gitignore` ya excluye archivos `.env` y claves de servicio.
- La configuración web de Firebase (apiKey, etc.) no es secreta, pero las API keys deben quedar restringidas por dominio en Google Cloud.

## Marca

| Token | Color |
|---|---|
| Naranja principal | `#FF5A1F` |
| Azul noche | `#101C2C` |
| Turquesa | `#20C997` |
| Crema | `#FFF7ED` |
| Blanco | `#FFFFFF` |

Tipografías: Archivo (títulos) y Onest (texto), desde Google Fonts.
