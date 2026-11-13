/**
 * Live Upload's settings (2026-11-13): the few values every board's Upload
 * button uses. Wi-Fi name and password, the group (the person's own by
 * default) and, for Module 4, the group's board key. A module whose file has
 * no Wi-Fi (Module 1) shows only the group.
 */
import { useId, useState } from "react";
import GroupPicker from "../ui/GroupPicker";
import PasswordField from "../ui/PasswordField";
import { BOARDS } from "../../lib/serial-lines";
import { uploadFile, validateUploadValues, type UploadValues } from "../../lib/live-build";
import type { Lang } from "../../lib/kelas";
import { UP, uploadError } from "./uploadStrings";

export function uploadFacts(modul: number) {
  const first = BOARDS[modul]?.[0];
  const f = first ? uploadFile(modul, first.role) : null;
  return { wifi: !!f?.wifi, key: !!f?.key };
}

export default function UploadPanel({
  lang,
  modul,
  groups,
  ownGroup,
  values,
  onChange,
  keyFilled,
}: {
  lang: Lang;
  modul: number;
  groups: number[];
  ownGroup: number | null;
  values: UploadValues;
  onChange: (v: UploadValues) => void;
  /** The key came from the Hunt step */
  keyFilled: boolean;
}) {
  const t = UP[lang];
  const id = useId();
  const facts = uploadFacts(modul);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const touch = (k: string) => setTouched((m) => (m[k] ? m : { ...m, [k]: true }));
  const role = BOARDS[modul]?.[0]?.role ?? "";
  const check = validateUploadValues(modul, role, values);
  const bad = (field: string) =>
    !check.ok && check.field === field && touched[field]
      ? uploadError(lang, check.kode)
      : undefined;
  const set = (patch: Partial<UploadValues>) => onChange({ ...values, ...patch });
  // A group no file can be made for (Module 4 has five) is named at once, not after a blur.
  const groupError =
    !check.ok && check.field === "group" ? uploadError(lang, check.kode) : undefined;

  return (
    <div className="uploadset">
      <p className="hint uploadset__intro">{t.intro}</p>
      <div className="uploadset__grid">
        {facts.wifi && (
          <>
            <div className="field" data-invalid={bad("ssid") ? "yes" : undefined}>
              <label className="field__label" htmlFor={`${id}-ssid`}>
                {t.ssid}
              </label>
              <input
                id={`${id}-ssid`}
                className="field__input"
                value={values.ssid}
                maxLength={64}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                onChange={(e) => set({ ssid: e.target.value })}
                onBlur={() => touch("ssid")}
                aria-invalid={bad("ssid") ? true : undefined}
              />
              {bad("ssid") ? (
                <p className="field__error" role="alert">
                  {bad("ssid")}
                </p>
              ) : (
                <p className="field__hint">{t.ssidHint}</p>
              )}
            </div>
            <PasswordField
              label={t.password}
              value={values.password}
              onChange={(v) => set({ password: v })}
              autoComplete="new-password"
              hint={t.passwordHint}
              error={bad("password")}
              lang={lang}
            />
          </>
        )}
        <div className="field" data-invalid={groupError ? "yes" : undefined}>
          <span className="field__label">{t.group}</span>
          <GroupPicker
            value={values.group}
            onValueChange={(g) => set({ group: g })}
            groups={groups}
            label={t.group}
            aria-label={t.group}
            mark={ownGroup ?? undefined}
            markLabel={t.mine}
          />
          {groupError && (
            <p className="field__error" role="alert">
              {groupError}
            </p>
          )}
        </div>
        {facts.key && (
          <div className="field" data-invalid={bad("key") ? "yes" : undefined}>
            <label className="field__label" htmlFor={`${id}-key`}>
              {t.key}
            </label>
            <input
              id={`${id}-key`}
              className="field__input uploadset__key"
              value={values.key ?? ""}
              maxLength={8}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              onChange={(e) => set({ key: e.target.value.toUpperCase() })}
              onBlur={() => touch("key")}
              aria-invalid={bad("key") ? true : undefined}
            />
            {bad("key") ? (
              <p className="field__error" role="alert">
                {bad("key")}
              </p>
            ) : (
              <p className="field__hint">{keyFilled ? t.keyFilled : t.keyHint}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
