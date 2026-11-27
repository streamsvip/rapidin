/* =========================================================
   RAPIDIN · Configuración pública de la web
   Estos valores NO son secretos: viajan dentro de la página.
   La seguridad se logra restringiendo cada clave por dominio
   en Google Cloud (ver README → «Conectar Google Maps»).
   ========================================================= */
export const CONFIG = {
  // API key de Google Maps (Maps JavaScript API), restringida por dominio.
  // Vacía = se usa el mapa referencial de Camaná.
  googleMapsApiKey: "",

  // Map ID de Google Cloud (estilo del mapa con los colores de RAPIDIN).
  // Vacío = DEMO_MAP_ID, válido solo para pruebas.
  googleMapId: "",

  // Zona de cobertura inicial (Camaná). Los puntos fuera de este rectángulo se rechazan.
  zona: { norte: -16.612, sur: -16.636, oeste: -72.725, este: -72.697 },

  // WhatsApp del administrador (sin +51). Recibe los avisos de «Registra tu negocio».
  // En la demo se abre WhatsApp con el mensaje listo; en producción lo envía una Cloud Function.
  adminWhatsapp: "916252754",

  // Datos reales en Firebase (proyecto rapidin-87442). "demo" = datos de prueba en el navegador.
  backend: "firebase",

  // firebaseConfig de la app web «RAPIDIN Web». No es secreto: la seguridad
  // la ponen las reglas de Firestore (archivo firestore.rules en la raíz del repo).
  firebase: {
    apiKey: "AIzaSyCgmOXyyCMc-3cAo2p-Uf-0jpnujVDHhCw",
    authDomain: "rapidin-87442.firebaseapp.com",
    projectId: "rapidin-87442",
    storageBucket: "rapidin-87442.firebasestorage.app",
    messagingSenderId: "564060557075",
    appId: "1:564060557075:web:59d394a5e0e8ba10c954e6",
  },
};
