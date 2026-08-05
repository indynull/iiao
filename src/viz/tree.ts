import type { TreeNode } from "../analyze/types";

/**
 * Vertical decision flow — readable cards, not a tiny compressed SVG graph.
 * Walks the measured tree and renders each question + yes/no outcomes.
 */
export class IiaoTree extends HTMLElement {
  #tree: TreeNode | null = null;

  set tree(v: TreeNode | null) {
    this.#tree = v;
    this.render();
  }

  get tree() {
    return this.#tree;
  }

  connectedCallback() {
    this.render();
  }

  private render() {
    const root = this.#tree;
    if (!root) {
      this.innerHTML = "";
      return;
    }

    const steps = flattenSteps(root);
    const stepsHtml = steps
      .map((step, i) => {
        if (step.kind === "root") {
          return `
            <div class="dt-step dt-step--root">
              <div class="dt-step__index">Q</div>
              <div class="dt-step__body">
                <p class="dt-step__label">${esc(step.label)}</p>
                ${step.detail ? `<p class="dt-step__detail">${esc(step.detail)}</p>` : ""}
              </div>
            </div>`;
        }
        if (step.kind === "test") {
          return `
            <div class="dt-step dt-step--test">
              <div class="dt-step__index">${i}</div>
              <div class="dt-step__body">
                <p class="dt-step__label">${esc(step.label)}</p>
                ${step.detail ? `<p class="dt-step__detail"><span class="dt-mono">${esc(step.detail)}</span></p>` : ""}
                <div class="dt-branches" role="group" aria-label="Outcomes">
                  ${step.branches
                    .map(
                      (b) => `
                    <div class="dt-branch dt-branch--${b.outcome}${b.taken ? " dt-branch--taken" : " dt-branch--idle"}">
                      <span class="dt-branch__tag">${esc(b.label)}</span>
                      ${b.detail ? `<span class="dt-branch__meta">${esc(b.detail)}</span>` : ""}
                      ${b.taken ? `<span class="dt-branch__badge">taken</span>` : ""}
                    </div>`,
                    )
                    .join("")}
                </div>
              </div>
            </div>`;
        }
        // leaf
        return `
          <div class="dt-step dt-step--leaf dt-step--${step.outcome}">
            <div class="dt-step__index">✓</div>
            <div class="dt-step__body">
              <p class="dt-step__label">${esc(step.label)}</p>
              ${step.detail ? `<p class="dt-step__detail">${esc(step.detail)}</p>` : ""}
            </div>
          </div>`;
      })
      .join('<div class="dt-connector" aria-hidden="true"></div>');

    this.innerHTML = `
      <div class="dt">
        <p class="dt-legend">
          <span class="dt-legend__swatch dt-legend__swatch--taken"></span> what happened
          <span class="dt-legend__swatch dt-legend__swatch--idle"></span> what didn't
        </p>
        <div class="dt-flow">
          ${stepsHtml}
        </div>
      </div>
    `;
  }
}

type FlatStep =
  | { kind: "root"; label: string; detail?: string }
  | {
      kind: "test";
      label: string;
      detail?: string;
      branches: {
        label: string;
        detail?: string;
        outcome: string;
        taken: boolean;
      }[];
    }
  | { kind: "leaf"; label: string; detail?: string; outcome: string };

/** Convert tree into ordered vertical steps along the full test sequence. */
function flattenSteps(root: TreeNode): FlatStep[] {
  const out: FlatStep[] = [
    { kind: "root", label: root.label, detail: root.detail },
  ];

  let cursor: TreeNode | null = root;
  const seen = new Set<string>();

  while (cursor) {
    if (seen.has(cursor.id)) break;
    seen.add(cursor.id);

    const kids: TreeNode[] = cursor.children ?? [];
    let qNode: TreeNode | undefined;
    if (cursor.outcome === "question" && cursor.id !== "root") {
      qNode = cursor;
    } else {
      qNode = kids.find(
        (c: TreeNode) => c.outcome === "question" || looksLikeQuestion(c),
      );
    }

    if (!qNode) {
      const leaf = findTakenLeaf(cursor);
      if (leaf && leaf.id !== root.id) {
        out.push({
          kind: "leaf",
          label: leaf.label,
          detail: leaf.detail,
          outcome:
            leaf.outcome === "yes"
              ? "yes"
              : leaf.outcome === "no"
                ? "no"
                : "leaf",
        });
      }
      break;
    }

    const branches = (qNode.children ?? []).map((b: TreeNode) => ({
      label: b.label,
      detail: b.detail,
      outcome: b.outcome ?? "mid",
      taken: !!b.taken,
    }));

    if (branches.length >= 1 && qNode.id !== "root") {
      out.push({
        kind: "test",
        label: qNode.label,
        detail: qNode.detail,
        branches,
      });
    }

    const taken: TreeNode | undefined = (qNode.children ?? []).find(
      (c: TreeNode) => c.taken,
    );
    if (!taken) break;

    const nextQ: TreeNode | undefined = (taken.children ?? []).find(
      (c: TreeNode) => c.outcome === "question" || looksLikeQuestion(c),
    );
    if (nextQ) {
      cursor = nextQ;
      continue;
    }

    const leaf: TreeNode | undefined =
      (taken.children ?? []).find((c: TreeNode) => !c.children?.length) ??
      (taken.children ?? [])[0];
    if (leaf) {
      out.push({
        kind: "leaf",
        label: leaf.label,
        detail: leaf.detail,
        outcome:
          leaf.outcome === "yes" ||
          leaf.label.toLowerCase().includes("os-ward")
            ? "yes"
            : leaf.outcome === "no"
              ? "no"
              : "leaf",
      });
    }
    break;
  }

  return out;
}

function looksLikeQuestion(n: TreeNode): boolean {
  return /\?$/.test(n.label.trim()) || n.id.startsWith("t-") || n.id.startsWith("Q");
}

function findTakenLeaf(n: TreeNode): TreeNode | null {
  if (n.taken && !n.children?.length) return n;
  for (const c of n.children ?? []) {
    if (!c.taken) continue;
    const f = findTakenLeaf(c);
    if (f) return f;
  }
  return null;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

if (!customElements.get("iiao-tree")) {
  customElements.define("iiao-tree", IiaoTree);
}
