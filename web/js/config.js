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
  // Se abre WhatsApp con el mensaje listo (fase 2: aviso automático con una Cloud Function).
  adminWhatsapp: "916252754",

  // WhatsApp de soporte para clientes y repartidores (sin +51). Cada sección envía un mensaje distinto.
  soporteWhatsapp: "916252754",

  // Número de RAPIDIN que recibe las recargas (Yape, Plin, Lemon y transferencias desde otros bancos al celular).
  // titular: nombre que verá la persona al yapear; déjalo vacío para no mostrarlo.
  recarga: { numero: "916252754", titular: "" },

  // UID de los administradores (Firebase → Authentication → Usuarios). Al ingresar, la web
  // crea su registro en la colección «admins» si falta (las reglas solo lo permiten a estos UID).
  adminUids: ["b4kKYUJfmyOYspeA0X11DzOpqID2"],

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
