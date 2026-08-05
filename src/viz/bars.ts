import type { Criterion } from "../analyze/types";

export class IiaoBars extends HTMLElement {
  #items: Criterion[] = [];

  set items(v: Criterion[]) {
    this.#items = v;
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  private render() {
    const rows = this.#items
      .map(
        (c, i) => `
      <div class="bar-row" style="--i: ${i}">
        <div class="bar-row__meta">
          <span class="bar-row__label">${escapeHtml(c.label)} <span class="bar-row__w">×${c.weight}</span></span>
          <span class="bar-row__score">${Math.round(c.score * 100)}</span>
        </div>
        <div class="bar-row__track">
          <div class="bar-row__fill" style="--w: ${c.score}"></div>
        </div>
        <p class="bar-row__note">${escapeHtml(c.note)}</p>
        ${
          c.inputs?.length
            ? `<ul class="bar-row__inputs">${c.inputs.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`
            : ""
        }
      </div>`,
      )
      .join("");

    this.innerHTML = `<div class="bars">${rows}</div>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

if (!customElements.get("iiao-bars")) {
  customElements.define("iiao-bars", IiaoBars);
}
