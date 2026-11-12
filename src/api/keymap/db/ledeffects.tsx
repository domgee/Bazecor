/* bazecor-keymap -- Bazecor keymap library
 * Copyright (C) 2018  Keyboardio, Inc.
 * Copyright (C) 2019  DygmaLab SE
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import React from "react";
import { IconLEDNextEffect, IconLEDPreviousEffect, IconLEDToggleEffect } from "@Renderer/components/atoms/icons";
import { LED_CUSTOM_FIRST, MAX_LED_SLOTS } from "../../parsers/ledCustom";

/* Static labels of the custom effect slots. The editors label them from the table, and these show where it is unknown */
const LEDCustomKeys = Array.from({ length: MAX_LED_SLOTS }, (_, slot) => ({
  code: LED_CUSTOM_FIRST + slot,
  labels: {
    top: "LED",
    primary: `SLOT ${slot + 1}`,
    verbose: `Custom effect ${slot + 1}`,
  },
}));

const LEDEffectsTable = {
  groupName: "LED Effect",
  keys: [
    {
      code: 17152,
      labels: {
        top: "LED",
        primary: <IconLEDNextEffect size="sm" />,
        verbose: "Next",
      },
    },
    {
      code: 17153,
      labels: {
        top: "LED",
        primary: <IconLEDPreviousEffect size="sm" />,
        verbose: "Previous",
      },
    },
    {
      code: 17154,
      labels: {
        primary: <IconLEDToggleEffect size="sm" />,
        top: "LED",
        verbose: "Toggle",
      },
    },
    ...LEDCustomKeys,
  ],
};

export default LEDEffectsTable;
