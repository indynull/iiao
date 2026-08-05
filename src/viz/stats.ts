import type { ConfidenceStep, SignalStat } from "../analyze/types";

export class IiaoStats extends HTMLElement {
  #signals: SignalStat[] = [];
  #steps: ConfidenceStep[] = [];

  set data(v: { signals: SignalStat[]; steps: ConfidenceStep[] }) {
    this.#signals = v.signals;
    this.#steps = v.steps;
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  private render() {
    const max = Math.max(1, ...this.#signals.map((s) => s.count));
    const rows = this.#signals
      .map((s) => {
        const pct = (s.count / max) * 100;
        return `
        <tr>
          <td class="stats__label">${escapeHtml(s.label)}</td>
          <td class="stats__count">${s.count}</td>
          <td class="stats__bar-cell">
            <div class="stats__bar"><span style="width:${pct}%"></span></div>
          </td>
        </tr>`;
      })
      .join("");

    const steps = this.#steps
      .map((s, i) => {
        const sign = s.delta >= 0 && i > 0 ? "+" : "";
        const d =
          i === 0
            ? s.total.toFixed(1)
            : `${sign}${s.delta.toFixed(1)}`;
        return `
        <tr>
          <td class="stats__label">${escapeHtml(s.label)}</td>
          <td class="stats__delta">${d}</td>
          <td class="stats__total">${s.total.toFixed(1)}%</td>
        </tr>`;
      })
      .join("");

    this.innerHTML = `
      <div class="stats-grid">
        <div>
          <h3 class="stats__h">Words that snitched</h3>
          <table class="stats-table">
            <thead><tr><th>Crime</th><th>n</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div>
          <h3 class="stats__h">How we got to the %</h3>
          <table class="stats-table">
            <thead><tr><th>Plot twist</th><th>Δ</th><th>Total</th></tr></thead>
            <tbody>${steps}</tbody>
          </table>
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

if (!customElements.get("iiao-stats")) {
  customElements.define("iiao-stats", IiaoStats);
}
