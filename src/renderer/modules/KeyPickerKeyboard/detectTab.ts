import log from "electron-log/renderer";
import { AutoshiftCodes } from "../../../hw/autoshift";
import { CapsWordCodes } from "../../../hw/capsword";
import { isHoldCode } from "../../../hw/layerhold";
import { isRepeatKey } from "../../../hw/repeatkey";
import { isSwapHandsCode } from "../../../hw/swaphands";
import { decodeDualUse } from "../../../api/parsers/altRepeat";
import { SUPERKEY_CODES, SUPERKEY_FIRST } from "../../../api/parsers/superkeys";
import { LED_CUSTOM_LAST } from "../../../api/parsers/ledCustom";

const isSuperkeyKeyCode = (keyCode: number) => keyCode >= SUPERKEY_FIRST && keyCode < SUPERKEY_FIRST + SUPERKEY_CODES;

/** The picker tab that edits this keycode, given the tab that is open now. With the Multi-action tab, Superkeys and dual-function keys
 * open it. */
export const detectTab = (keyCode: number, currentTab: string | undefined, hasMultiAction = false): string => {
  if (hasMultiAction && (isSuperkeyKeyCode(keyCode) || decodeDualUse(keyCode) !== null)) {
    log.info("detectedTab", keyCode, "tabMultiAction");
    return "tabMultiAction";
  }

  /* A hold key is a shortcut, so open the Keys tab even right after a layer key */
  if (isHoldCode(keyCode)) {
    log.info("detectedTab", keyCode, "tabKeys");
    return "tabKeys";
  }

  let tab = "";
  if (keyCode < 256 || keyCode === 65535) {
    tab = "tabKeys";
  }

  if (keyCode >= 256 && keyCode <= 8192) {
    tab = "tabKeys";
  }

  if (keyCode >= 17408 && keyCode <= 17501) {
    tab = "tabLayers";
  }

  if (keyCode >= 49161 && keyCode <= 49168) {
    tab = "tabLayers";
  }

  if (keyCode >= 51218 && keyCode <= 53266) {
    tab = "tabLayers";
  }

  if (keyCode >= 49153 && keyCode <= 49160) {
    tab = "tabLayers";
  }

  if (keyCode >= 49169 && keyCode <= 50961) {
    tab = "tabLayers";
  }

  /* Next, Previous, Toggle and the custom effect slots */
  if (keyCode >= 17152 && keyCode <= LED_CUSTOM_LAST) {
    tab = "tabMedia";
  }

  if ([19682, 18552, 18834, 20865, 20866].includes(keyCode)) {
    tab = "tabMedia";
  }

  if (keyCode >= 22709 && keyCode <= 22733) {
    tab = "tabMedia";
  }

  if (keyCode >= 23663 && keyCode <= 23786) {
    tab = "tabMedia";
  }

  if (keyCode >= 20481 && keyCode <= 20488) {
    tab = "tabMouse";
  }

  if (keyCode >= 20497 && keyCode <= 20504) {
    tab = "tabMouse";
  }

  if (keyCode >= 20545 && keyCode <= 20560) {
    tab = "tabMouse";
  }

  if (keyCode >= 53852 && keyCode <= 53979) {
    tab = "tabMacro";
  }

  /* Without the Multi-action tab no tab edits a Superkey, so open the Keys tab */
  if (isSuperkeyKeyCode(keyCode)) {
    tab = "tabKeys";
  }

  if (keyCode >= 54108 && keyCode <= 54111) {
    tab = "tabWireless";
  }

  if (keyCode >= 54112 && keyCode <= 54114) {
    tab = "tabLayerLens";
  }

  /* Autoshift is an ordinary key with a property, so it belongs on the Keys tab. CapsWord is assigned from Layers & modifiers.
   * Without these two the lookup falls through with an empty string and the picker ends up with no active tab, which looks like the panel closing */
  if (keyCode >= AutoshiftCodes.AUTOSHIFT_FIRST && keyCode <= AutoshiftCodes.AUTOSHIFT_LAST) {
    tab = "tabKeys";
  }

  if (keyCode === CapsWordCodes.CAPS_WORD) {
    tab = "tabLayers";
  }

  /* The Repeat key is assigned from Layers & modifiers */
  if (isRepeatKey(keyCode)) {
    tab = "tabLayers";
  }

  /* Swap hands keys are assigned from Layers & modifiers */
  if (isSwapHandsCode(keyCode)) {
    tab = "tabLayers";
  }

  log.info("detectedTab", keyCode, tab);

  /* Fall back to the Keys tab so an unknown keycode does not blank the tab strip */
  if (tab === "") {
    log.warn("[KeyPicker] no tab matched keycode, falling back to tabKeys", keyCode);
    tab = "tabKeys";
  }

  if (currentTab === "tabLayers" && tab === "tabKeys" && keyCode > 223) {
    tab = "tabLayers";
  }

  /* keep Advanced Modifiers enabled regardless of sk20 */
  return tab;
};

export default detectTab;
