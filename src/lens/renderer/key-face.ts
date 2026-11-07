import type { DecodedKey, KeyboardModel } from "../shared/types";
import { decodeKey, layoutOverrides, superkeyIndex, symbolOverrides } from "./keycodes";
import { macroDisplayNames, modStyleFor, superkeySlotLabels } from "./action-labels";
import type { LabelContext, ModStyle, SlotLabels } from "./action-labels";

/* What each Lens keyboard view draws on a key face, shared by the Sonsei, Defy and Raise2 views */

export interface FaceOptions {
  expandSuperkeys?: boolean;
  expandMacros?: boolean;
  modStyle?: ModStyle;
}

export interface FaceContext extends LabelContext {
  superkeys: number[][];
  expandSuperkeys: boolean;
}

/** The collapsed label, plus the slot labels when the key is an expanded Superkey */
export interface KeyFace {
  label: DecodedKey;
  slots: SlotLabels | null;
}

export function faceContext(
  model: KeyboardModel,
  layout: string,
  layerNames: string[] | undefined,
  options: FaceOptions = {},
): FaceContext {
  const baseCtx: LabelContext = {
    overrides: layoutOverrides(layout),
    symbols: symbolOverrides(layout),
    layerNames: model.layerNames?.length ? model.layerNames : (layerNames ?? []),
    macroNames: model.macroNames ?? [],
    superkeyNames: model.superkeyNames ?? [],
    modStyle: options.modStyle ?? modStyleFor(typeof navigator === "undefined" ? "" : navigator.userAgent),
  };

  return {
    ...baseCtx,
    macroNames: options.expandMacros ? macroDisplayNames(baseCtx.macroNames, model.macros ?? [], baseCtx) : baseCtx.macroNames,
    superkeys: model.superkeys ?? [],
    expandSuperkeys: Boolean(options.expandSuperkeys),
  };
}

export function keyFace(code: number, ctx: FaceContext): KeyFace {
  const sk = superkeyIndex(code);

  if (sk !== null) {
    return {
      label: { primary: "SUPER", subtitle: ctx.superkeyNames[sk] || `SK${sk + 1}`, hold: "" },
      slots: ctx.expandSuperkeys ? superkeySlotLabels(ctx.superkeys[sk], ctx) : null,
    };
  }

  return { label: decodeKey(code, ctx.overrides, ctx.layerNames, ctx.macroNames, ctx.symbols), slots: null };
}
