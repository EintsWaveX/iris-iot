/**
 * The Pencipta and DEV badges (Phase 9 roles), shared by the Team page and
 * the Account page. Each explains itself in a tooltip.
 */
import { CodeIcon, StarFourIcon } from "@phosphor-icons/react";
import { dict } from "../../lib/app";
import type { Lang } from "../../lib/kelas";
import Tooltip from "./Tooltip";
import "./PersonBadges.css";

const T = dict({
  id: {
    dev: "Ikut membangun situs ini (divisi ASO dan ARM)",
    pencipta: "Pembuat situs ini",
    penciptaName: "Pencipta",
  },
  en: {
    dev: "Helped build this site (ASO and ARM divisions)",
    pencipta: "The creator of this site",
    penciptaName: "Creator",
  },
  zh: {
    dev: "参与搭建这个网站（ASO 和 ARM 部门）",
    pencipta: "这个网站的创建者",
    penciptaName: "创建者",
  },
});

export default function PersonBadges({
  badges,
  lang,
  sm,
}: {
  badges: string[];
  lang: Lang;
  sm?: boolean;
}) {
  const t = T[lang];
  return (
    <>
      {badges.includes("pencipta") && (
        <Tooltip label={t.pencipta}>
          <span className={`pbadge pbadge--pencipta${sm ? " pbadge--sm" : ""}`} tabIndex={0}>
            <StarFourIcon size={13} weight="fill" aria-hidden="true" />
            {t.penciptaName}
          </span>
        </Tooltip>
      )}
      {badges.includes("dev") && (
        <Tooltip label={t.dev}>
          <span className={`pbadge pbadge--dev${sm ? " pbadge--sm" : ""}`} tabIndex={0}>
            <CodeIcon size={13} aria-hidden="true" />
            DEV
          </span>
        </Tooltip>
      )}
    </>
  );
}
