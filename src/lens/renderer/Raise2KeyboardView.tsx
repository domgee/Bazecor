import React from "react";
import type { KeyboardModel } from "../shared/types";
import { RAISE2_ANSI_KEYS, RAISE2_ANSI_SVG_W, RAISE2_ANSI_VIEW_Y, RAISE2_ANSI_VIEW_H } from "./geometry-raise2-ansi";
import { RAISE2_ISO_KEYS, RAISE2_ISO_SVG_W, RAISE2_ISO_VIEW_Y, RAISE2_ISO_VIEW_H } from "./geometry-raise2-iso";
import { RAISE2_THUMB_PATHS } from "./raise2-thumb-paths";
import { RAISE2_ISO_ENTER_PATH } from "./raise2-iso-enter-path";
import { faceContext, keyFace } from "./key-face";
import {
  keyLabel,
  fg,
  comboBadge,
  comboBadgeNearLabel,
  comboNumbersForLayer,
  superkeySlots,
  SILHOUETTE_HALF_W,
  SLOT_BADGE_LIFT,
} from "./key-label";

interface Props {
  model: KeyboardModel;
  activeLayer: number;
  layout: string;
  layerNames?: string[];
  expandSuperkeys?: boolean;
  expandMacros?: boolean;
}

// The upper rect of the L-shaped ISO Enter face (x 4..65, y 0..51), where an expanded Superkey's slots fit
const ISO_ENTER_SLOTS = { cx: 34.5, cy: 24.5, halfW: 26 };

/**
 * Renders the Raise2 layout in the overlay. Shares Lens' key-cell look with the
 * Sonsei/Defy views (same fonts, modifier boxes, color/contrast rules) but
 * drives it from RAISE2_KEYS geometry. Regular keys are rounded rects; the two
 * thumb wing keys (t5/t8) use their real Layout-Editor silhouettes
 * (RAISE2_THUMB_PATHS: outer bezel + inset color face) — the rest of the thumb
 * row is plain rects, since Raise2's thumb cluster (unlike Defy's) is mostly
 * regular keys with only those two special shapes.
 */
export const Raise2KeyboardView: React.FC<Props> = ({
  model,
  activeLayer,
  layout,
  layerNames,
  expandSuperkeys,
  expandMacros,
}) => {
  // Raise2 ships as ANSI or ISO; the two layouts only diverge near Enter and the
  // left-Shift row (see geometry-raise2-iso.ts), but that's enough to need a
  // distinct key set/silhouette table. ANSI is the fallback for boards where
  // keyboardType wasn't captured (e.g. backups saved before this field existed).
  const isIso = model.keyboardType?.toLowerCase() === "iso";
  const keys = isIso ? RAISE2_ISO_KEYS : RAISE2_ANSI_KEYS;
  const svgW = isIso ? RAISE2_ISO_SVG_W : RAISE2_ANSI_SVG_W;
  const viewY = isIso ? RAISE2_ISO_VIEW_Y : RAISE2_ANSI_VIEW_Y;
  const viewH = isIso ? RAISE2_ISO_VIEW_H : RAISE2_ANSI_VIEW_H;
  const thumbPaths = isIso ? { ...RAISE2_THUMB_PATHS, ...RAISE2_ISO_ENTER_PATH } : RAISE2_THUMB_PATHS;

  const ctx = faceContext(model, layout, layerNames, { expandSuperkeys, expandMacros });
  const layer = Math.min(activeLayer, model.keymap.length - 1);
  const keymapLayer = model.keymap[layer] ?? [];
  const colormapLayer = model.colormap[layer] ?? [];
  const { palette } = model;
  const comboNumbers = comboNumbersForLayer(model.combos, layer);

  function getColor(ledIndex: number) {
    const pi = colormapLayer[ledIndex] ?? 0;
    const c = palette[pi] ?? { r: 30, g: 30, b: 30, rgb: "rgb(30,30,30)" };
    return { r: c.r, g: c.g, b: c.b, css: c.rgb };
  }

  function renderKey(key: (typeof RAISE2_ANSI_KEYS)[0]) {
    const color = getColor(key.ledIndex);
    const { label, slots } = keyFace(keymapLayer[key.index] ?? 0, ctx);
    const fgColor = fg(color.r, color.g, color.b);
    const comboNumber = comboNumbers.get(key.index);
    const { x, y, w, h } = key;

    // Non-rect keys (thumb wings, ISO's tall Enter): draw the editor silhouette
    // (outer bezel + inset color face) in a group translated to the key origin,
    // so the extracted paths' local coords hold.
    const thumb = key.thumbType ? thumbPaths[key.thumbType] : undefined;
    if (thumb) {
      const lcx = 4 + (w - 8) / 2;
      const lcy = (h - 8) / 2;
      let face = (
        <>
          {keyLabel(lcx, lcy, 0, h, label, fgColor)}
          {comboNumber !== undefined && comboBadgeNearLabel(comboNumber, lcx, lcy)}
        </>
      );

      if (slots) {
        const isIsoEnter = key.thumbType === "raise2-iso-enter";
        const sx = isIsoEnter ? ISO_ENTER_SLOTS.cx : lcx;
        const sy = isIsoEnter ? ISO_ENTER_SLOTS.cy : lcy;
        const halfW = isIsoEnter ? ISO_ENTER_SLOTS.halfW : SILHOUETTE_HALF_W;
        face = (
          <>
            {superkeySlots(sx, sy, halfW, slots, fgColor)}
            {comboNumber !== undefined && comboBadgeNearLabel(comboNumber, sx, sy, 0, SLOT_BADGE_LIFT)}
          </>
        );
      }

      return (
        <g key={`k-${key.index}`} transform={`translate(${x},${y})`}>
          <g className="key-shadow-hover" transform="translate(0,4)">
            <path d={thumb.base} fill={color.css} />
          </g>
          <path d={thumb.base} fill="#303949" />
          <path d={thumb.base} fill="url(#lens-key-sheen)" fillOpacity="0.35" />
          <g transform="translate(4,0)">
            <g className="key-shadow-middle" transform="translate(0,12)">
              <path d={thumb.inner} fill={color.css} />
            </g>
            <path d={thumb.inner} fill={color.css} />
            <path d={thumb.inner} fill="url(#lens-key-sheen)" fillOpacity="0.45" />
          </g>
          {face}
        </g>
      );
    }

    const cx = x + 4 + (w - 8) / 2;
    const cy = y + (h - 8) / 2;
    return (
      <g key={`k-${key.index}`}>
        <rect className="key-shadow-hover" x={x} y={y + 4} width={w} height={h} rx={4} fill={color.css} />
        <rect x={x} y={y} width={w} height={h} rx={4} fill="#303949" />
        <rect x={x} y={y} width={w} height={h} rx={4} fill="url(#lens-key-sheen)" fillOpacity="0.35" />
        <rect className="key-shadow-middle" x={x + 4} y={y + 12} width={w - 8} height={h - 8} rx={4} fill={color.css} />
        <rect x={x + 4} y={y} width={w - 8} height={h - 8} rx={4} fill={color.css} />
        <rect x={x + 4} y={y} width={w - 8} height={h - 8} rx={4} fill="url(#lens-key-sheen)" fillOpacity="0.45" />
        {slots ? superkeySlots(cx, cy, (w - 8) / 2, slots, fgColor) : keyLabel(cx, cy, y, h, label, fgColor)}
        {comboNumber !== undefined && comboBadge(comboNumber, x + w - 1, y - 3)}
      </g>
    );
  }

  const layerName = ctx.layerNames[layer] ?? `Layer ${layer}`;

  return (
    <div className="keyboard-view">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 ${viewY} ${svgW} ${viewH}`} style={{ width: "100%", display: "block" }}>
        <defs>
          <linearGradient id="lens-key-sheen" x1="0" y1="0" x2="1" y2="0">
            <stop offset="25%" stopColor="#fff" stopOpacity="1" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g id="raise2-keyshapes">{keys.map(renderKey)}</g>
        <text
          x={svgW / 2}
          y={viewY + viewH - 12}
          textAnchor="middle"
          fontSize={13}
          fill="rgba(255,255,255,0.35)"
          fontFamily="system-ui,-apple-system,sans-serif"
          className="layer-label"
        >
          {layerName}
        </text>
      </svg>
    </div>
  );
};
