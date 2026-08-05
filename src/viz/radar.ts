export type RadarPoint = { axis: string; value: number };

export class IiaoRadar extends HTMLElement {
  #data: RadarPoint[] = [];

  set data(v: RadarPoint[]) {
    this.#data = v;
    this.render();
  }

  get data() {
    return this.#data;
  }

  connectedCallback() {
    this.render();
  }

  private render() {
    const data = this.#data;
    if (!data.length) {
      this.innerHTML = "";
      return;
    }

    const size = 280;
    const cx = size / 2;
    const cy = size / 2;
    const maxR = 100;
    const n = data.length;
    const levels = 4;

    const pt = (i: number, frac: number) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      return [cx + Math.cos(a) * maxR * frac, cy + Math.sin(a) * maxR * frac] as const;
    };

    const rings = Array.from({ length: levels }, (_, li) => {
      const frac = (li + 1) / levels;
      const pts = Array.from({ length: n }, (__, i) => pt(i, frac).join(",")).join(" ");
      return `<polygon class="radar__ring" points="${pts}" />`;
    }).join("");

    const spokes = Array.from({ length: n }, (_, i) => {
      const [x, y] = pt(i, 1);
      return `<line class="radar__spoke" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" />`;
    }).join("");

    const poly = data
      .map((d, i) => pt(i, Math.min(1, Math.max(0, d.value / 100))).join(","))
      .join(" ");

    const labels = data
      .map((d, i) => {
        const [x, y] = pt(i, 1.18);
        const anchor = x < cx - 8 ? "end" : x > cx + 8 ? "start" : "middle";
        return `<text class="radar__label" x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle">${escapeXml(shortAxis(d.axis))}</text>`;
      })
      .join("");

    this.innerHTML = `
      <div class="radar">
        <svg viewBox="0 0 ${size} ${size}" class="radar__svg" role="img" aria-label="OS-ness radar">
          ${rings}
          ${spokes}
          <polygon class="radar__area" points="${poly}" />
          <polygon class="radar__outline" points="${poly}" fill="none" />
          ${labels}
        </svg>
      </div>
    `;
  }
}

function shortAxis(s: string): string {
  return s.length > 16 ? s.slice(0, 14) + "…" : s;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

if (!customElements.get("iiao-radar")) {
  customElements.define("iiao-radar", IiaoRadar);
}
