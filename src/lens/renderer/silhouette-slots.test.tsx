import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { KeyboardModel } from "../shared/types";
import { KeyboardView } from "./KeyboardView";

type Point = [number, number];

// Read SVG path data into a polygon shifted right by dx, with curves and arcs sampled into short segments
function pathToPolygon(d: string, dx: number): Point[] {
  const points: Point[] = [];
  let pos = 0;

  const skip = () => {
    while (pos < d.length && /[\s,]/.test(d[pos])) {
      pos += 1;
    }
  };

  const hasNumber = () => {
    skip();
    return pos < d.length && /[-+.\d]/.test(d[pos]);
  };

  const num = () => {
    skip();
    const match = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(d.slice(pos));

    if (!match) {
      throw new Error(`Bad path at ${pos}: ${d.slice(pos, pos + 10)}`);
    }

    pos += match[0].length;
    return Number(match[0]);
  };

  const flag = () => {
    skip();
    const value = d[pos] === "1";
    pos += 1;
    return value;
  };

  let cur: Point = [0, 0];
  let start: Point = [0, 0];
  let lastCtrl: Point | null = null;
  const STEPS = 16;

  const add = (p: Point) => {
    points.push([p[0] + dx, p[1]]);
    cur = p;
  };

  const cubic = (c1: Point, c2: Point, end: Point) => {
    const p0 = cur;

    for (let i = 1; i <= STEPS; i += 1) {
      const t = i / STEPS;
      const u = 1 - t;
      add([
        u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * end[0],
        u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * end[1],
      ]);
    }
  };

  const arc = (rxIn: number, ryIn: number, phiDeg: number, large: boolean, sweep: boolean, end: Point) => {
    const [x1, y1] = cur;
    const [x2, y2] = end;
    let rx = Math.abs(rxIn);
    let ry = Math.abs(ryIn);

    if (rx === 0 || ry === 0) {
      add(end);
      return;
    }

    const phi = (phiDeg * Math.PI) / 180;
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    const hx = (x1 - x2) / 2;
    const hy = (y1 - y2) / 2;
    const x1p = cos * hx + sin * hy;
    const y1p = -sin * hx + cos * hy;
    const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);

    if (lambda > 1) {
      rx *= Math.sqrt(lambda);
      ry *= Math.sqrt(lambda);
    }

    const num2 = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    const coef = (large !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, num2 / den));
    const cxp = (coef * rx * y1p) / ry;
    const cyp = (-coef * ry * x1p) / rx;
    const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
    const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
    const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const th1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dth = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);

    if (!sweep && dth > 0) {
      dth -= 2 * Math.PI;
    } else if (sweep && dth < 0) {
      dth += 2 * Math.PI;
    }

    for (let i = 1; i <= STEPS; i += 1) {
      const t = th1 + (dth * i) / STEPS;
      add([cos * rx * Math.cos(t) - sin * ry * Math.sin(t) + cx, sin * rx * Math.cos(t) + cos * ry * Math.sin(t) + cy]);
    }

    cur = end;
  };

  let command = "";

  while (pos < d.length) {
    skip();

    if (pos >= d.length) {
      break;
    }

    if (/[a-zA-Z]/.test(d[pos])) {
      command = d[pos];
      pos += 1;
    } else if (command === "M") {
      command = "L";
    } else if (command === "m") {
      command = "l";
    }

    const rel = command === command.toLowerCase();
    const ox = rel ? cur[0] : 0;
    const oy = rel ? cur[1] : 0;
    const upper = command.toUpperCase();
    let nextCtrl: Point | null = null;

    if (upper === "M") {
      const p: Point = [ox + num(), oy + num()];
      add(p);
      start = p;
    } else if (upper === "L") {
      add([ox + num(), oy + num()]);
    } else if (upper === "H") {
      add([ox + num(), cur[1]]);
    } else if (upper === "V") {
      add([cur[0], oy + num()]);
    } else if (upper === "C") {
      const c1: Point = [ox + num(), oy + num()];
      const c2: Point = [ox + num(), oy + num()];
      const end: Point = [ox + num(), oy + num()];
      cubic(c1, c2, end);
      nextCtrl = c2;
    } else if (upper === "S") {
      const c1: Point = lastCtrl ? [2 * cur[0] - lastCtrl[0], 2 * cur[1] - lastCtrl[1]] : cur;
      const c2: Point = [ox + num(), oy + num()];
      const end: Point = [ox + num(), oy + num()];
      cubic(c1, c2, end);
      nextCtrl = c2;
    } else if (upper === "A") {
      const rx = num();
      const ry = num();
      const phi = num();
      const large = flag();
      const sweep = flag();
      arc(rx, ry, phi, large, sweep, [ox + num(), oy + num()]);
    } else if (upper === "Z") {
      cur = start;
    } else {
      throw new Error(`Unsupported path command ${command}`);
    }

    lastCtrl = nextCtrl;

    if (upper === "Z" && hasNumber()) {
      throw new Error("Numbers after Z");
    }
  }

  return points;
}

function insidePolygon([x, y]: Point, polygon: Point[]): boolean {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

function rotateAbout([x, y]: Point, transform: string | null): Point {
  const match = transform ? /^rotate\(([-\d.]+),([-\d.]+),([-\d.]+)\)$/.exec(transform) : null;

  if (!match) {
    return [x, y];
  }

  const [a, cx, cy] = match.slice(1).map(Number);
  const r = (a * Math.PI) / 180;
  return [cx + (x - cx) * Math.cos(r) - (y - cy) * Math.sin(r), cy + (x - cx) * Math.sin(r) + (y - cy) * Math.cos(r)];
}

const SUPERKEY_1 = 53980;

// Probe around each slot anchor, so the text keeps a margin to the face edge
const PROBES: Point[] = [
  [0, 0],
  [0, -3.5],
  [0, 3.5],
  [-1.5, 0],
  [1.5, 0],
];

// Render every silhouette key as an expanded Superkey and list the slots with a probe off the key's face
function slotsOffTheFace(product: string, keys: number[], keyboardType?: string) {
  const layer = new Array<number>(80).fill(4);

  keys.forEach(key => {
    layer[key] = SUPERKEY_1;
  });

  const model: KeyboardModel = {
    product,
    keyboardType,
    keymap: [layer],
    palette: [],
    colormap: [[]],
    defaultLayer: 0,
    superkeys: [[5, 6, 7, 9, 10]],
    superkeyNames: [],
    macroNames: [],
    macros: [],
    layerNames: [],
    combos: [],
  };
  const { container } = render(<KeyboardView model={model} activeLayer={0} layout="en-US" expandSuperkeys />);
  const keyGroups = [...container.querySelectorAll("g")].filter(
    g => (g.getAttribute("transform") ?? "").startsWith("translate(") && g.querySelector("g[data-slot]"),
  );
  const offFace: string[] = [];

  keyGroups.forEach(group => {
    // Defy and Raise2 draw the face inset by 4, Sonsei draws the silhouette itself as the face
    const inset = [...group.children].find(child => child.getAttribute("transform") === "translate(4,0)");
    const facePath = [...(inset ?? group).children].find(child => child.tagName.toLowerCase() === "path");
    const face = pathToPolygon(facePath?.getAttribute("d") ?? "", inset ? 4 : 0);

    group.querySelectorAll("g[data-slot]").forEach(slot => {
      const text = slot.querySelector("text");
      const x = Number(text?.getAttribute("x"));
      const y = Number(text?.getAttribute("y"));
      const rotation = slot.parentElement?.getAttribute("transform") ?? null;
      const off = PROBES.map(([px, py]) => rotateAbout([x + px, y + py], rotation)).some(p => !insidePolygon(p, face));

      if (off) {
        offFace.push(`${group.getAttribute("transform")} ${slot.getAttribute("data-slot")}`);
      }
    });
  });

  return { keys: keyGroups.length, offFace };
}

describe("Expanded Superkey slots on silhouettes", () => {
  test("SonseiThumbs_SlotsOnTheFace", () => {
    expect(slotsOffTheFace("Sonsei", [48, 49, 50, 51, 56, 57, 58, 59])).toEqual({ keys: 8, offFace: [] });
  });

  test("DefyThumbs_SlotsOnTheFace", () => {
    const thumbs = Array.from({ length: 16 }, (_, i) => 64 + i);

    expect(slotsOffTheFace("Defy", thumbs)).toEqual({ keys: 16, offFace: [] });
  });

  test("Raise2AnsiWings_SlotsOnTheFace", () => {
    // Keys 69 and 73 are the two thumb wings
    expect(slotsOffTheFace("Raise2", [69, 73], "ANSI")).toEqual({ keys: 2, offFace: [] });
  });

  test("Raise2IsoWingsAndEnter_SlotsOnTheFace", () => {
    // Key 31 is the ISO Enter
    expect(slotsOffTheFace("Raise2", [31, 69, 73], "ISO")).toEqual({ keys: 3, offFace: [] });
  });
});
