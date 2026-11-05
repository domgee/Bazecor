/* Bazecor
 * Copyright (C) 2026  DygmaLab SE.
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

import { AltRepeatRule } from "@Renderer/types/altRepeat";

/* Put an "A2" chip in the top-left corner of every key with previous-key rules, built like the combo badge in comboBadges.ts.
 * Use ::before, since the combo badge takes ::after */

/** Static half of the badge, visible only once a generated rule supplies its content. */
export const altRepeatBadgeBaseStyles = `
.keyContentLabel::before {
  position: absolute;
  top: -3px;
  left: -3px;
  padding: 0 3px;
  border-radius: 3px;
  font-size: 8px;
  font-weight: 700;
  line-height: 12px;
  letter-spacing: 0.02em;
  color: #fff;
  background: #0e9f6e;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}
`;

/** The badge text per key on `layer`, "A<n>" for n rules. */
export const altRepeatBadgeLabels = (rules: AltRepeatRule[], layer: number): Map<number, string> => {
  const counts = new Map<number, number>();

  rules.forEach(rule => {
    if (rule.layer === layer) {
      counts.set(rule.position, (counts.get(rule.position) ?? 0) + 1);
    }
  });

  const labels = new Map<number, string>();
  counts.forEach((count, position) => labels.set(position, `A${count}`));
  return labels;
};

/** One rule per key with previous-key rules on `layer`, scoped to one view's container. */
export const altRepeatBadgeStyles = (rules: AltRepeatRule[], layer: number, scope = ".layoutEditor"): string => {
  const styles: string[] = [];

  altRepeatBadgeLabels(rules, layer).forEach((label, position) => {
    styles.push(`${scope} [data-key-index="${position}"] .keyContentLabel::before { content: "${label}"; }`);
  });

  return styles.join("\n");
};
