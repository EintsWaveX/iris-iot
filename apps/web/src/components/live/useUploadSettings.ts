/**
 * Live Upload's settings kept between visits (2026-11-13): the Wi-Fi name and
 * the group on this laptop for good (a per-person convenience), the Wi-Fi
 * password for this tab only. The group defaults to the person's own; the
 * Module 4 board key is filled from the Hunt step when a hunt is open.
 * Every storage call is guarded: private windows and blocked site data throw.
 */
import { useEffect, useRef, useState } from "react";
import type { UploadValues } from "../../lib/live-build";

const KEEP = "iris.upload.v1";
const PW = "iris.upload.pw";

function read(): { ssid?: string; group?: number } {
  try {
    const x = JSON.parse(localStorage.getItem(KEEP) ?? "{}") as { ssid?: unknown; group?: unknown };
    return {
      ...(typeof x.ssid === "string" ? { ssid: x.ssid } : {}),
      ...(typeof x.group === "number" ? { group: x.group } : {}),
    };
  } catch {
    return {};
  }
}

/** Fired on the window whenever the Live form's Wi-Fi name or password changes in this tab */
const GANTI = "iris-upload-wifi";

/** The Wi-Fi name and password typed in Live, as far as this laptop kept them (either may be empty) */
export function wifiDiketik(): { ssid: string; password: string } {
  let password = "";
  try {
    password = sessionStorage.getItem(PW) ?? "";
  } catch {
    /* no storage */
  }
  return { ssid: read().ssid ?? "", password };
}

/**
 * What the person typed in Live, kept in step as they type: the Hunt step shows the same hotspot name
 * and password the boards were set up with. Empty until something is typed (and on the server).
 */
export function useWifiDiketik(): { ssid: string; password: string } {
  const [w, setW] = useState({ ssid: "", password: "" });
  useEffect(() => {
    const baca = () => setW(wifiDiketik());
    baca();
    window.addEventListener(GANTI, baca);
    window.addEventListener("storage", baca);
    return () => {
      window.removeEventListener(GANTI, baca);
      window.removeEventListener("storage", baca);
    };
  }, []);
  return w;
}

export function useUploadSettings(
  ownGroup: number | null,
  huntKey: string | null,
  /** The group's hotspot from the Hunt step (its name and password), while both boxes are empty */
  net: { ssid: string; sandi: string } | null = null,
) {
  const [values, setValues] = useState<UploadValues>({
    ssid: "",
    password: "",
    group: ownGroup ?? 1,
    key: "",
  });
  const [keyFilled, setKeyFilled] = useState(false);
  const loaded = useRef(false);
  const grouped = useRef(false);
  /** The key last put in from the Hunt step, so clearing the box is not undone */
  const filledFor = useRef<string | null>(null);

  // Once on the client: what this laptop remembered.
  useEffect(() => {
    const kept = read();
    let password = "";
    try {
      password = sessionStorage.getItem(PW) ?? "";
    } catch {
      /* no storage */
    }
    setValues((v) => ({
      ...v,
      ssid: kept.ssid ?? v.ssid,
      password,
      group: ownGroup ?? kept.group ?? v.group,
    }));
    loaded.current = true;
  }, []);

  // The person's own group arrives later than the first paint: follow it until they pick another.
  useEffect(() => {
    if (ownGroup !== null && !grouped.current) setValues((v) => ({ ...v, group: ownGroup }));
  }, [ownGroup]);

  // The Hunt step's key, while the box is still empty.
  useEffect(() => {
    if (huntKey && huntKey !== filledFor.current) {
      filledFor.current = huntKey;
      setValues((v) => (v.key ? v : { ...v, key: huntKey }));
      setKeyFilled(true);
    }
  }, [huntKey]);

  // The group's hotspot, once, so the first upload needs nothing typed. After that the person's own choice stands.
  const netFilled = useRef<string | null>(null);
  useEffect(() => {
    if (!net || netFilled.current === net.ssid) return;
    netFilled.current = net.ssid;
    setValues((v) => (v.ssid ? v : { ...v, ssid: net.ssid, password: v.password || net.sandi }));
  }, [net]);

  const change = (v: UploadValues) => {
    if (v.group !== values.group) grouped.current = true;
    if (v.key !== values.key) setKeyFilled(false);
    setValues(v);
    if (!loaded.current) return;
    try {
      localStorage.setItem(KEEP, JSON.stringify({ ssid: v.ssid, group: v.group }));
    } catch {
      /* no storage */
    }
    try {
      sessionStorage.setItem(PW, v.password);
    } catch {
      /* no storage */
    }
    window.dispatchEvent(new Event(GANTI));
  };

  return { values, change, keyFilled };
}
