import "./styles.css";
import "./viz/gauge";
import { cycleEnginePrefer, enginePreferLabel, renderApp } from "./app";

const mount = document.getElementById("app");
if (!mount) throw new Error("#app missing");

const boot = () => {
  void renderApp(mount);
};

/** Hidden: Ctrl+Shift+E cycles auto → AI → rules (clears judge cache). */
window.addEventListener("keydown", (e) => {
  if (!(e.ctrlKey && e.shiftKey)) return;
  if (e.key !== "E" && e.key !== "e") return;
  // don't steal from password fields on /board
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) {
    const input = t as HTMLInputElement;
    if (input.type === "password") return;
  }
  e.preventDefault();
  const next = cycleEnginePrefer();
  const el = document.getElementById("toast");
  if (el) {
    el.textContent = enginePreferLabel(next);
    el.classList.add("show");
    window.setTimeout(() => el.classList.remove("show"), 2200);
  }
});

window.addEventListener("popstate", boot);
boot();
