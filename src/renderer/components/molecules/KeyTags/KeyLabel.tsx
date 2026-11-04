import React from "react";
import { KeyType } from "@Renderer/types/layout";

interface KeyLabelProps {
  keyData: KeyType;
}

// Show the tag along with the label, as layer and OneShot keys carry their whole label in the tag
const KeyLabel = ({ keyData }: KeyLabelProps) => (
  <>
    {React.isValidElement(keyData.extraLabel) && keyData.extraLabel}
    {keyData.label !== "" && <span>{keyData.label}</span>}
  </>
);

export default KeyLabel;
