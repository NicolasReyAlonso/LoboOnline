export const environment = {
  /**
   * URL del backend. Vacío = mismo origen que la web.
   * - En desarrollo, `ng serve` reenvía /socket.io a http://localhost:3000 (ver proxy.conf.json).
   * - Al publicar en GitHub Pages, el workflow sobrescribe este fichero con la variable
   *   BACKEND_URL del repositorio (ver .github/workflows/pages.yml).
   */
  serverUrl: '',
};
