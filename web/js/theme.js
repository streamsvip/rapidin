/* =========================================================
   RAPIDIN · Tema claro / oscuro de los paneles
   Se guarda en este dispositivo. «sistema» sigue al celular o PC.
   En las apps (Flutter) se usará la misma preferencia y paleta.
   ========================================================= */
const KEY = "rapidin.theme";
const mq = matchMedia("(prefers-color-scheme: dark)");
export const getTheme = () => { try { return localStorage.getItem(KEY) || "light"; } catch (e) { return "light"; } };
export function applyTheme(pref = getTheme()) {
  const dark = pref === "dark" || (pref === "system" && mq.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const inApp = document.body.classList.contains("in-app");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark && inApp ? "#0B131E" : "#101C2C");
  return dark;
}
export function setTheme(pref) { try { localStorage.setItem(KEY, pref); } catch (e) {} return applyTheme(pref); }
export const toggleTheme = () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
mq.addEventListener?.("change", () => { if (getTheme() === "system") applyTheme(); });
applyTheme();
