/**
 * Room setup (plotPengawas right) and kit loans (kitLoans right), mockup
 * r3-ruang and EXAM-ENGINE 9.3a and 9.6a: the room's name and pengawas, its
 * phone hotspots (a candidate's own phone above the pengawas fallback, a
 * password that is typed but never shown back), and one row per candidate for
 * the kit lent to them.
 */
import { useEffect, useMemo, useState } from "react";
import { EyeIcon, EyeSlashIcon, TrashIcon, XIcon } from "@phosphor-icons/react";
import { Checkbox, Stepper } from "../../../../ui/Controls";
import Dropdown from "../../../../ui/Dropdown";
import IconButton from "../../../../ui/IconButton";
import Pill from "../../../../ui/Pill";
import type { Lang } from "../../../../../lib/kelas";
import { isFail, recPost } from "../../../../../lib/recruitment/client";
import { CAP_BAWAAN } from "../../../../../lib/recruitment/hotspot";
import type { ConsoleView } from "../../../../../lib/recruitment/room-api";
import type { KitBoard } from "../../../../../lib/recruitment/room-types";
import { tanggalWib } from "../../../../../lib/recruitment/gates";
import { tgl } from "../../../shared";
import { RG } from "./ruangStrings";

/** The slot's day in WIB (a slot at 00:30 WIB is the day before in UTC). */
const hariWib = (iso: string) => tanggalWib(new Date(iso)).tanggal;
const toast = (m: string, tone: "ok" | "warn" | "danger" = "ok") => window.Toast?.show(m, tone);
const depan = (n: string) => n.split(" ")[0] ?? n;

type Orang = { nim: string; nama: string; kode: string };

/* ---------------------------------------------------------------- hotspots */

interface Baris {
  id: string;
  /** a Panitia code, or `seat:<seatId>` */
  owner: string;
  ssid: string;
  /** typed this time; empty keeps the sealed one */
  pass: string;
  cap: number;
  by?: "cand" | "master";
  hasPass: boolean;
  show: boolean;
}

function dariView(h: ConsoleView["hotspots"][number]): Baris {
  return {
    id: h.id,
    owner: typeof h.owner === "object" ? `seat:${h.owner.seat}` : h.owner,
    ssid: h.ssid,
    pass: "",
    cap: h.cap || CAP_BAWAAN,
    by: h.by,
    hasPass: h.hasPass,
    show: false,
  };
}

function Hotspots({
  lang,
  v,
  people,
  simpan,
}: {
  lang: Lang;
  v: ConsoleView;
  people: Orang[];
  simpan: (body: Record<string, unknown>, ok: string) => Promise<boolean>;
}) {
  const t = RG[lang].hs;
  const [list, setList] = useState<Baris[]>(() => v.hotspots.map(dariView));
  const kunci = JSON.stringify(v.hotspots.map((h) => [h.id, h.ssid, h.cap, h.hasPass]));
  useEffect(() => setList(v.hotspots.map(dariView)), [kunci]);

  const seatOf = (id: string) => v.seats.find((s) => s.seatId === Number(id.slice(5)));
  const own = list.filter((h) => h.owner.startsWith("seat:"));
  const fb = list.filter((h) => !h.owner.startsWith("seat:"));
  const upd = (id: string, o: Partial<Baris>) =>
    setList((l) => l.map((h) => (h.id === id ? { ...h, ...o } : h)));
  const owners = [
    ...people.map((p) => ({ value: p.kode, label: p.nama, chip: p.kode })),
    ...v.seats
      .filter((s) => s.seatId !== null && s.kit)
      .map((s) => ({
        value: `seat:${s.seatId}`,
        label: t.seatOf(s.no, depan(s.nama)),
      })),
  ];
  const covered = v.plan.onPhones;
  const need = v.plan.need;
  const have = fb.length;
  const cap = fb.reduce((a, h) => a + h.cap, 0);

  const Row = (h: Baris) => {
    const mine = h.owner.startsWith("seat:");
    const cand = mine && h.by === "cand";
    const sk = mine ? seatOf(h.owner) : undefined;
    return (
      <div className="r3hs__row" data-own={mine ? "yes" : "no"} key={h.id}>
        <div className="r3lbl">
          <Dropdown
            id={`r3-own-${h.id}`}
            label={mine ? t.owner : t.ownerPhone}
            value={h.owner}
            disabled={cand}
            options={
              owners.some((o) => o.value === h.owner)
                ? owners
                : [...owners, { value: h.owner, label: h.owner }]
            }
            onChange={(val) =>
              val.startsWith("seat:")
                ? upd(h.id, { owner: val, by: "master", cap: 0 })
                : upd(h.id, { owner: val, by: undefined, cap: h.cap || CAP_BAWAAN })
            }
          />
        </div>
        <label className="r3lbl">
          <span className="label-caps">{t.ssid}</span>
          {cand ? (
            <span className="r3hs__ro">{h.ssid}</span>
          ) : (
            <input
              className="input"
              id={`r3-ssid-${h.id}`}
              value={h.ssid}
              maxLength={32}
              onChange={(e) => upd(h.id, { ssid: e.target.value })}
            />
          )}
        </label>
        <label className="r3lbl">
          <span className="label-caps">{t.pass}</span>
          {cand ? (
            <span className="r3hs__ro hint">{t.sealed(sk ? depan(sk.nama) : "")}</span>
          ) : (
            <span className="r3pw">
              <input
                className="input"
                id={`r3-pw-${h.id}`}
                type={h.show ? "text" : "password"}
                autoComplete="new-password"
                placeholder={h.hasPass ? t.passKeep : ""}
                value={h.pass}
                maxLength={63}
                onChange={(e) => upd(h.id, { pass: e.target.value })}
              />
              <IconButton
                icon={h.show ? EyeSlashIcon : EyeIcon}
                label={h.show ? t.passHide : t.passShow}
                sm
                onClick={() => upd(h.id, { show: !h.show })}
              />
            </span>
          )}
        </label>
        <div className="r3lbl">
          <span className="label-caps">{t.boards}</span>
          {mine ? (
            <span className="r3hs__ro">
              <b className="num">{v.plan.groups[h.id]?.cap ?? 0}</b>{" "}
              <span className="hint">Wi-Fi</span>
            </span>
          ) : (
            <Stepper
              value={h.cap}
              min={1}
              max={30}
              label={t.cap}
              lessLabel={t.capLess}
              moreLabel={t.capMore}
              onChange={(n) => upd(h.id, { cap: n })}
            />
          )}
        </div>
        <IconButton
          icon={TrashIcon}
          kind="danger"
          label={mine ? t.release : t.del}
          onClick={() => setList((l) => l.filter((x) => x.id !== h.id))}
        />
      </div>
    );
  };

  const kirim = () =>
    simpan(
      {
        hotspots: list.map((h) => {
          const mine = h.owner.startsWith("seat:");
          return {
            id: h.id.startsWith("new-") ? undefined : h.id,
            owner: mine ? { seat: Number(h.owner.slice(5)) } : h.owner,
            ssid: h.ssid,
            ...(h.pass ? { pass: h.pass } : {}),
            cap: h.cap,
          };
        }),
      },
      t.saved,
    );

  return (
    <section className="panel r3hs stack">
      <div className="panel__head">
        <div className="stack" style={{ gap: 2 }}>
          <h2 className="panel__title">{t.title}</h2>
          <span className="hint">{t.sum(v.plan.wifi, covered, v.plan.rest)}</span>
        </div>
        <Pill tone={have < need ? "danger" : "ok"}>
          {have < need ? t.need(need, have) : t.needOk(need, have, cap)}
        </Pill>
      </div>
      <div className="stack stack--sm">
        <div className="row row--between">
          <span className="eyebrow">{t.cand}</span>
          <span className="hint">{t.candHint(own.length)}</span>
        </div>
        {own.length ? (
          <div className="r3hs__list">{own.map(Row)}</div>
        ) : (
          <span className="hint r3hs__empty">{t.candEmpty}</span>
        )}
      </div>
      <div className="stack stack--sm">
        <div className="row row--between">
          <span className="eyebrow">{t.fallback}</span>
          <span className="hint">{t.fallbackHint}</span>
        </div>
        <div className="r3hs__list">{fb.map(Row)}</div>
      </div>
      <div className="row">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() =>
            setList((l) => [
              ...l,
              {
                id: `new-${l.length}-${Date.now() % 1000}`,
                owner: people[0]?.kode ?? "",
                ssid: "",
                pass: "",
                cap: CAP_BAWAAN,
                hasPass: false,
                show: false,
              },
            ])
          }
        >
          {t.add}
        </button>
        <button type="button" className="btn btn--primary" onClick={() => void kirim()}>
          {t.save}
        </button>
      </div>
      <div className="rec-note">
        <b>{t.setupTitle}</b>
        <ul className="r3list">
          {t.setup.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
      <span className="hint">{t.sealNote}</span>
    </section>
  );
}

/* -------------------------------------------------------------- the room */

export function RuangPengaturan({
  lang,
  v,
  people,
  refresh,
}: {
  lang: Lang;
  v: ConsoleView;
  people: Orang[];
  refresh: () => void;
}) {
  const t = RG[lang].setup;
  const [nama, setNama] = useState(v.room.title);
  const [pilih, setPilih] = useState<string[]>(v.pengawas.map((p) => p.nim));
  const kunci = v.pengawas.map((p) => p.nim).join(",");
  useEffect(() => setPilih(v.pengawas.map((p) => p.nim)), [kunci]);
  const selesai = v.view === "finished";

  async function simpan(extra: Record<string, unknown>, ok: string): Promise<boolean> {
    const r = await recPost<{ ok: true }>("room-setup", {
      id: v.room.id,
      slotId: v.room.slot?.id,
      rehearsal: v.room.rehearsal,
      title: nama,
      ...extra,
    });
    if (isFail(r)) {
      toast(t.bad[r.kode] ?? RG[lang].con.fail, "danger");
      return false;
    }
    toast(ok);
    refresh();
    return true;
  }

  const kandidat = useMemo(() => people, [people]);
  const slot = v.room.slot;
  return (
    <div className="r3setup">
      <section className="panel stack">
        <div className="panel__head">
          <h2 className="panel__title">{t.room}</h2>
          <span className="hint">{slot ? t.fromSlot : t.practice}</span>
        </div>
        {slot ? (
          <div className="rec-sum">
            <span className="hint">{t.slot}</span>
            <b>
              {tgl(hariWib(slot.startsAt), lang)} · {slot.room}
            </b>
            <span className="hint">{t.candidates}</span>
            <b>{v.seats.length}</b>
          </div>
        ) : (
          <p className="hint">{t.practiceNote}</p>
        )}
        <label className="r3lbl">
          <span className="label-caps">{t.name}</span>
          <input
            className="input"
            id="r3-room-title"
            value={nama}
            maxLength={60}
            disabled={selesai}
            onChange={(e) => setNama(e.target.value)}
          />
        </label>
        {slot && (
          <div className="stack stack--sm">
            <span className="label-caps">{t.pengawas}</span>
            <div className="rec-chips" role="group" aria-label={t.pickAria}>
              {kandidat.map((p) => (
                <button
                  key={p.nim}
                  type="button"
                  className="r3chip"
                  aria-pressed={pilih.includes(p.nim)}
                  title={p.nama}
                  onClick={() =>
                    setPilih((l) =>
                      l.includes(p.nim) ? l.filter((x) => x !== p.nim) : [...l, p.nim],
                    )
                  }
                >
                  {p.kode}
                </button>
              ))}
            </div>
            <span className="hint">{pilih.length ? t.pengawasHint : t.pengawasNone}</span>
          </div>
        )}
        <div className="r3switchrow">
          <div className="stack" style={{ gap: 2 }}>
            <b>{t.practice}</b>
            <span className="hint">{t.practiceHint}</span>
          </div>
          <Checkbox
            checked={v.room.rehearsal}
            onChange={() => undefined}
            disabled
            label={""}
            ariaLabel={t.practice}
          />
        </div>
        <div className="row row--end">
          {selesai && <span className="hint">{t.locked}</span>}
          <button
            type="button"
            className="btn btn--primary"
            disabled={selesai}
            onClick={() => void simpan(slot ? { pengawas: pilih } : {}, t.saved)}
          >
            {t.save}
          </button>
        </div>
      </section>
      <Hotspots lang={lang} v={v} people={people} simpan={simpan} />
    </div>
  );
}

/* -------------------------------------------------------------------- kits */

interface Pinjam {
  code: string;
  boards: KitBoard[];
  returned: boolean;
}

export function RuangKit({
  lang,
  v,
  refresh,
}: {
  lang: Lang;
  v: ConsoleView;
  refresh: () => void;
}) {
  const t = RG[lang].kit;
  const [rows, setRows] = useState<Record<number, Pinjam | null>>({});
  useEffect(() => {
    setRows(
      Object.fromEntries(
        v.seats.map((s) => [
          s.candidateId,
          s.kit ? { code: s.kit.code, boards: s.kit.boards, returned: !!s.kit.returnedAt } : null,
        ]),
      ),
    );
  }, [v.seats]);
  const bisa = v.me.canKit;
  const set = (id: number, p: Pinjam | null) => setRows((r) => ({ ...r, [id]: p }));
  const chipOpt = (["esp32", "esp32s3"] as const).map((c) => ({ value: c, label: t.chips[c] }));

  async function simpan(id: number, p: Pinjam) {
    if (!p.code.trim()) return toast(t.codeNeeded, "warn");
    const r = await recPost<{ ok: true }>("room-kit", {
      id: v.room.id,
      candidateId: id,
      kit: p.code,
      boards: p.boards.map((b) => ({ chip: b.chip, code: b.code })),
      returned: p.returned,
    });
    if (isFail(r)) toast(RG[lang].con.guard[r.kode] ?? RG[lang].con.fail, "danger");
    else {
      toast(t.saved);
      refresh();
    }
  }

  return (
    <section className="panel r3kits stack">
      <div className="panel__head">
        <div className="stack" style={{ gap: 2 }}>
          <h2 className="panel__title">{t.head}</h2>
          <span className="hint">{bisa ? t.hint : t.readOnly}</span>
        </div>
      </div>
      <div className="r3kits__list">
        {v.seats.map((s) => {
          const p = rows[s.candidateId] ?? null;
          return (
            <div className="r3kit" key={s.candidateId} data-none={p ? "no" : "yes"}>
              <span className="stack" style={{ gap: 0, minWidth: 0 }}>
                <b>{s.nama}</b>
                <span className="hint">
                  {t.seat(s.no)}
                  {s.checkedIn ? "" : t.notIn}
                </span>
              </span>
              {p ? (
                <>
                  <input
                    className="input r3kit__code"
                    id={`r3-kit-${s.candidateId}`}
                    aria-label={t.code}
                    placeholder={t.code}
                    value={p.code}
                    disabled={!bisa}
                    maxLength={24}
                    onChange={(e) => set(s.candidateId, { ...p, code: e.target.value })}
                  />
                  <span className="r3kit__boards">
                    {p.boards.map((b, i) => (
                      <span className="r3kit__b" key={b.n}>
                        <span className="hint">{t.board(b.n)}</span>
                        <Dropdown
                          id={`r3-chip-${s.candidateId}-${b.n}`}
                          label={t.chip(b.n)}
                          hideLabel
                          value={b.chip}
                          disabled={!bisa}
                          options={chipOpt}
                          onChange={(c) =>
                            set(s.candidateId, {
                              ...p,
                              boards: p.boards.map((x, j) =>
                                j === i ? { ...x, chip: c as KitBoard["chip"] } : x,
                              ),
                            })
                          }
                        />
                      </span>
                    ))}
                    {bisa &&
                      (p.boards.length < 2 ? (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() =>
                            set(s.candidateId, {
                              ...p,
                              boards: [...p.boards, { n: 2, chip: "esp32" }],
                            })
                          }
                        >
                          {t.addBoard}
                        </button>
                      ) : (
                        <IconButton
                          icon={XIcon}
                          sm
                          label={t.removeBoard}
                          onClick={() => set(s.candidateId, { ...p, boards: p.boards.slice(0, 1) })}
                        />
                      ))}
                  </span>
                  <span className="r3kit__back">
                    <Checkbox
                      checked={p.returned}
                      disabled={!bisa}
                      onChange={(c) => set(s.candidateId, { ...p, returned: c })}
                      label={t.returned}
                      ariaLabel={t.returnedAria}
                    />
                    {bisa && (
                      <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        onClick={() => void simpan(s.candidateId, p)}
                      >
                        {t.save}
                      </button>
                    )}
                  </span>
                </>
              ) : (
                <>
                  <span className="hint r3kit__none">{t.none}</span>
                  {bisa && (
                    <button
                      type="button"
                      className="btn btn--inverse btn--sm"
                      onClick={() =>
                        set(s.candidateId, {
                          code: "",
                          boards: [{ n: 1, chip: "esp32" }],
                          returned: false,
                        })
                      }
                    >
                      {t.lend}
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
