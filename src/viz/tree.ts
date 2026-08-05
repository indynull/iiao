import type { TreeNode } from "../analyze/types";

type Laid = {
  node: TreeNode;
  x: number;
  y: number;
  children: Laid[];
};

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

  private layout(node: TreeNode, depth: number, nextLeaf: { i: number }): Laid {
    const kids = (node.children ?? []).map((c) => this.layout(c, depth + 1, nextLeaf));
    let x: number;
    if (!kids.length) {
      x = nextLeaf.i++;
    } else {
      x = (kids[0]!.x + kids[kids.length - 1]!.x) / 2;
    }
    return { node, x, y: depth, children: kids };
  }

  private render() {
    const root = this.#tree;
    if (!root) {
      this.innerHTML = "";
      return;
    }

    const laid = this.layout(root, 0, { i: 0 });
    const leafCount = Math.max(1, countLeaves(root));
    const depth = maxDepth(root);
    const xGap = 140;
    const yGap = 88;
    const padX = 80;
    const padY = 40;
    const width = Math.max(640, leafCount * xGap + padX * 2);
    const height = Math.max(280, depth * yGap + padY * 2 + 40);

    const coord = (n: Laid) => ({
      x: padX + n.x * xGap + xGap / 2,
      y: padY + n.y * yGap,
    });

    const lines: string[] = [];
    const boxes: string[] = [];

    const walk = (n: Laid) => {
      const p = coord(n);
      for (const c of n.children) {
        const q = coord(c);
        lines.push(
          `<path class="tree__edge tree__edge--${c.node.outcome ?? "mid"}" d="M${p.x},${p.y + 22} C${p.x},${(p.y + q.y) / 2} ${q.x},${(p.y + q.y) / 2} ${q.x},${q.y - 22}" />`,
        );
        walk(c);
      }
      const outcome = n.node.outcome ?? (n.node.children?.length ? "mid" : "leaf");
      boxes.push(`
        <g class="tree__node tree__node--${outcome}" transform="translate(${p.x}, ${p.y})">
          <rect x="-62" y="-22" width="124" height="44" rx="10" />
          <text class="tree__text" text-anchor="middle" dominant-baseline="middle">
            ${wrapLabel(n.node.label)}
          </text>
        </g>
      `);
    };
    walk(laid);

    this.innerHTML = `
      <div class="tree-wrap">
        <svg class="tree" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="Decision tree">
          ${lines.join("")}
          ${boxes.join("")}
        </svg>
      </div>
    `;
  }
}

function countLeaves(n: TreeNode): number {
  if (!n.children?.length) return 1;
  return n.children.reduce((a, c) => a + countLeaves(c), 0);
}

function maxDepth(n: TreeNode, d = 0): number {
  if (!n.children?.length) return d;
  return Math.max(...n.children.map((c) => maxDepth(c, d + 1)));
}

function wrapLabel(label: string): string {
  const words = label.split(/\s+/);
  if (label.length <= 22) {
    return `<tspan x="0" dy="0">${escapeXml(label)}</tspan>`;
  }
  const mid = Math.ceil(words.length / 2);
  const a = words.slice(0, mid).join(" ");
  const b = words.slice(mid).join(" ");
  return `<tspan x="0" dy="-0.35em">${escapeXml(a)}</tspan><tspan x="0" dy="1.1em">${escapeXml(b)}</tspan>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

if (!customElements.get("iiao-tree")) {
  customElements.define("iiao-tree", IiaoTree);
}
