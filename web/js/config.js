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

  // firebaseConfig del proyecto rapidin-dev (se completa en la fase de conexión).
  firebase: null,
};
