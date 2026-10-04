/**
 * The console's server drawer (P8.2): a right slide-over with everything a
 * running session needs from the Orange Pi, so nobody leaves the console:
 * health, the hotspot switch (the only one, the old tab's duplicate is
 * gone), services with restart and log peek, and the live command
 * timeline. It polls every 4 s while open. (Phase 9 dropped the ESP32 list
 * with the Devices tab.)
 */
import { ClockIcon, CpuIcon, ThermometerSimpleIcon, TimerIcon } from "@phosphor-icons/react";
import Drawer from "../ui/Drawer";
import { CommandTimeline, HotspotCard, Sejak, ServiceList } from "../server/ops";
import { href } from "../../lib/app";
import { tri } from "../../lib/labels";
import type { Lang } from "../../lib/kelas";
import type { Strings } from "./strings";
import type { ServerState } from "./data";
import { isOnline, type AsistenRef } from "./types";
import { durasiLabel } from "../../lib/labels";
import { namaAsisten } from "../../lib/people";

function uptime(sec: number | null | undefined, lang: Lang): string {
  if (!sec) return "·";
  return durasiLabel(Math.floor(sec / 60), lang);
}

export default function ServerDrawer({
  t,
  lang,
  open,
  onOpenChange,
  servers,
  refresh,
  asisten,
}: {
  t: Strings;
  lang: Lang;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  servers: ServerState | null;
  refresh: () => void;
  asisten: Map<string, AsistenRef>;
}) {
  const d = servers?.detail ?? null;
  const list = servers?.list ?? [];
  const hb = d?.denyutTerakhir ?? null;
  const on = d ? isOnline(hb, d.batasLuringDetik) : false;

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={t.drawerTitle}
      description={t.drawerSub}
      storeKey="console-server"
      closeLabel={t.close}
      resizeLabel={tri(lang, "Ubah lebar laci", "Resize the drawer", "调整抽屉宽度")}
    >
      {list.length === 0 ? (
        <p className="empty-note">{t.drawerNone}</p>
      ) : !d ? (
        <div className="stack">
          {list.map((s) => (
            <a key={s.id} className="deck-row" href={href(lang, `/servers?id=${s.id}`)}>
              <span
                className={`dot ${isOnline(s.denyutTerakhir, s.batasLuringDetik) ? "dot--ok" : "dot--danger"}`}
              />
              <span className="grow">{s.nama}</span>
            </a>
          ))}
        </div>
      ) : (
        <div className="stack stack--lg drawer-ops">
          <div className="drawer-ops__health">
            <div className="row">
              <span
                className={`dot ${on ? "dot--ok dot--pulse" : "dot--danger"}`}
                aria-hidden="true"
              />
              <b>{d.server.nama}</b>
              <span className="pill pill--mono">{d.server.kode}</span>
              <span className={`pill ${on ? "pill--ok" : "pill--danger"}`}>
                {on ? t.online : t.offlineS}
              </span>
            </div>
            <div className="drawer-ops__facts">
              <span>
                <ClockIcon size={15} aria-hidden="true" />{" "}
                <Sejak iso={hb?.pada ?? null} lang={lang} />
              </span>
              <span>
                <TimerIcon size={15} aria-hidden="true" /> {uptime(hb?.uptimeSec, lang)}
              </span>
              <span>
                <CpuIcon size={15} aria-hidden="true" />{" "}
                {hb?.cpu != null ? `${Math.round(hb.cpu)}%` : "·"}
              </span>
              <span>
                <ThermometerSimpleIcon size={15} aria-hidden="true" />{" "}
                {hb?.suhu != null ? `${Math.round(hb.suhu)}°C` : "·"}
              </span>
              <span className={hb?.jamSelaras ? "" : "drawer-ops__bad"}>
                {t.clock}: {hb?.jamSelaras ? t.clockOk : t.clockBad}
              </span>
            </div>
          </div>

          <HotspotCard lang={lang} serverId={d.server.id} hb={hb} onSent={refresh} />

          <section className="stack">
            <h3 className="label-caps">{t.services}</h3>
            <ServiceList
              lang={lang}
              serverId={d.server.id}
              hb={hb}
              perintah={d.perintah}
              onSent={refresh}
            />
          </section>

          <section className="stack">
            <h3 className="label-caps">{t.commands}</h3>
            <CommandTimeline
              lang={lang}
              perintah={d.perintah}
              kode={(nim) => (nim ? namaAsisten(asisten.get(nim), nim) : "")}
            />
          </section>

          <a className="btn btn--ghost" href={href(lang, `/servers?id=${d.server.id}`)}>
            {t.drawerOpenFull}
          </a>
        </div>
      )}
    </Drawer>
  );
}
