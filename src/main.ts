import "./styles.css";
import "./viz/gauge";
import "./viz/radar";
import "./viz/tree";
import "./viz/bars";
import "./viz/stats";
import { renderApp } from "./app";

const mount = document.getElementById("app");
if (!mount) throw new Error("#app missing");

const boot = () => {
  void renderApp(mount);
};

window.addEventListener("popstate", boot);
boot();
