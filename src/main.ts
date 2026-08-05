import "./styles.css";
import "./viz/gauge";
import { renderApp } from "./app";

const mount = document.getElementById("app");
if (!mount) throw new Error("#app missing");

const boot = () => {
  void renderApp(mount);
};

window.addEventListener("popstate", boot);
boot();
