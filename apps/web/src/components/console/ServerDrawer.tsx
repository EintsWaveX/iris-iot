/**
 * The console's server drawer (P8.2): a right slide-over with everything a
 * running session needs from the Orange Pi, so nobody leaves the console:
 * health, the hotspot switch (the only one, the old tab's duplicate is
 * gone), services with restart and log peek, and the live command
 * timeline. It polls every 4 s while open. (Phase 9 dropped the ESP32 list
 * with the Devices tab.)
 */
import {
  CaretRightIcon,
  ClockIcon,
  CpuIcon,
  ThermometerSimpleIcon,
  TimerIcon,
} from "@phosphor-icons/react";
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
import Nil from "../ui/Nil";

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
      resizeLabel={tri(lang, "Ubah lebar laci", "Resize the drawer", "调整侧栏宽度")}
    >
      {list.length === 0 ? (
        <p className="empty-note">{t.drawerNone}</p>
      ) : !d ? (
        <div className="stack srvpick">
          <p className="hint">
            {tri(
              lang,
              "Sesi ini belum memakai server tertentu. Pilih server untuk layanan, hotspot dan perintahnya.",
              "This session isn't tied to one server yet. Pick a server for its services, hotspot and commands.",
              "本节课还没有指定服务器。选择一台服务器查看服务、热点和命令。",
            )}
          </p>
          {list.map((s) => {
            const hb1 = s.denyutTerakhir;
            const up = isOnline(hb1, s.batasLuringDetik);
            const svc = Object.values(hb1?.layanan ?? {});
            const svcOk = svc.filter((x) => x === "aktif" || x === "active").length;
            return (
              <a
                key={s.id}
                className="srvpick__card sweep-hover"
                href={href(lang, `/servers?id=${s.id}`)}
              >
                <span className="row" style={{ gap: 8 }}>
                  <span
                    className={`dot ${up ? "dot--ok dot--pulse" : "dot--danger"}`}
                    aria-hidden="true"
                  />
                  <b className="grow">{s.nama}</b>
                  <span className={`pill ${up ? "pill--ok" : "pill--danger"}`}>
                    {up ? t.online : t.offlineS}
                  </span>
                </span>
                <span className="drawer-ops__facts">
                  <span>
                    <ClockIcon size={15} aria-hidden="true" />{" "}
                    <Sejak iso={hb1?.pada ?? null} lang={lang} />
                  </span>
                  {up && (
                    <>
                      <span>
                        <TimerIcon size={15} aria-hidden="true" /> {uptime(hb1?.uptimeSec, lang)}
                      </span>
                      {hb1?.cpu != null && (
                        <span>
                          <CpuIcon size={15} aria-hidden="true" /> {Math.round(hb1.cpu)}%
                        </span>
                      )}
                      {hb1?.suhu != null && (
                        <span>
                          <ThermometerSimpleIcon size={15} aria-hidden="true" />{" "}
                          {Math.round(hb1.suhu)}°C
                        </span>
                      )}
                      {svc.length > 0 && (
                        <span>
                          {t.services}: {svcOk}/{svc.length}
                        </span>
                      )}
                    </>
                  )}
                </span>
                <span className="srvpick__go">{t.drawerOpenFull}</span>
              </a>
            );
          })}
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
                {hb?.cpu != null ? `${Math.round(hb.cpu)}%` : <Nil dot />}
              </span>
              <span>
                <ThermometerSimpleIcon size={15} aria-hidden="true" />{" "}
                {hb?.suhu != null ? `${Math.round(hb.suhu)}°C` : <Nil dot />}
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
            <CaretRightIcon size={16} weight="bold" className="btn__go" aria-hidden="true" />
          </a>
        </div>
      )}
    </Drawer>
  );
}
