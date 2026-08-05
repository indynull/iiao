/** Confidence gauge as custom element. */

export class IiaoGauge extends HTMLElement {
  static get observedAttributes() {
    return ["value", "label"];
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    this.render();
  }

  private render() {
    const value = Math.min(100, Math.max(0, Number(this.getAttribute("value") ?? 0)));
    const label = this.getAttribute("label") ?? "confidence";
    const r = 54;
    const c = 2 * Math.PI * r;
    const dash = (value / 100) * c * 0.75;
    const gap = c - dash;
    const rot = 135;

    this.innerHTML = `
      <div class="gauge">
        <svg viewBox="0 0 140 140" class="gauge__svg" aria-hidden="true">
          <circle class="gauge__track" cx="70" cy="70" r="${r}"
            fill="none" stroke-width="10"
            stroke-dasharray="${c * 0.75} ${c * 0.25}"
            transform="rotate(${rot} 70 70)" />
          <circle class="gauge__value" cx="70" cy="70" r="${r}"
            fill="none" stroke-width="10"
            stroke-dasharray="${dash} ${gap + c * 0.25}"
            transform="rotate(${rot} 70 70)"
            style="--g: ${value}" />
        </svg>
        <div class="gauge__readout">
          <span class="gauge__num">${value}</span>
          <span class="gauge__unit">%</span>
          <span class="gauge__label">${escapeHtml(label)}</span>
        </div>
      </div>
    `;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

if (!customElements.get("iiao-gauge")) {
  customElements.define("iiao-gauge", IiaoGauge);
}
