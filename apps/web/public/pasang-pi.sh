#!/bin/sh
# IRIS IoT: set up a Pi for a server, in one line (the Server page's
# Daftarkan Server, step 2; 2026-10-07):
#
#   curl -fsSL https://<site>/pasang-pi.sh | sudo sh -s -- --situs https://<site> --kode <kode> --token <token>
#
# Run it as the Pi's own user (iris on Armbian) through sudo.
# - A fresh Pi: fetches the newest bundle CI signed, checks that signature,
#   unpacks it to /home/<user>/IRIS-ASO, runs scripts/opi_provision.sh,
#   registers the agent with the one-time token and starts it.
# - A Pi that already has iris-agent: nothing is reinstalled. It only
#   registers for this server: right away when it already reported to it
#   (a new token), after asking when it reported to another one. Code
#   updates come from the site's Perbarui button.
#
# --ya          answers "move to this server?" yes (no terminal needed)
# --pasang-ulang  reinstalls the newest bundle even though an agent exists
set -eu

SITUS=""
KODE=""
TOKEN=""
YA=0
ULANG=0
# Tests: nothing installed, registration with the unpacked agent.
UJI="${IRIS_PASANG_UJI:-}"
CONFIG="${IRIS_AGENT_CONFIG:-/etc/iris-agent/config.json}"
AGEN_DIR="${IRIS_AGENT_DIR:-/opt/iris-agent}"
while [ $# -gt 0 ]; do
  case "$1" in
    --situs) SITUS="$2"; shift 2 ;;
    --kode) KODE="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --ya) YA=1; shift ;;
    --pasang-ulang) ULANG=1; shift ;;
    *) echo "argumen tidak dikenal: $1" >&2; exit 2 ;;
  esac
done

langkah() { printf '\n== %s\n' "$1"; }
gagal() {
  printf '\nGAGAL: %s\n' "$1" >&2
  [ -z "$TAHAP" ] || kabar "$TAHAP" "$1"
  exit 1
}
# The step the site's wizard shows; empty until the site accepted the token.
TAHAP=""
ULANG_KABAR=false
# kabar <tahap> [failure]: tells the site's wizard where the install is.
# Best effort: a report that doesn't arrive never stops the install.
kabar() {
  TAHAP="$1"
  python3 - "$KERJA/kabar.json" "$KODE" "$TOKEN" "$1" "$ULANG_KABAR" "${2:-}" <<'PY' || return 0
import json, sys
berkas, kode, token, tahap, ulang, gagal = sys.argv[1:7]
with open(berkas, "w") as f:
    json.dump({"tipe": "pasang_kabar", "kode": kode, "token": token, "tahap": tahap,
               "ulang": ulang == "true", "gagal": gagal}, f)
PY
  curl -fsS --max-time 10 -H "Content-Type: application/json" --data @"$KERJA/kabar.json" \
    "$SITUS/api/agen" -o /dev/null 2>/dev/null || true
}

[ "$(id -u)" -eq 0 ] || gagal "jalankan lewat sudo: ... | sudo sh -s -- ..."
[ -n "$KODE" ] && [ -n "$TOKEN" ] || gagal "--kode dan --token wajib (salin baris lengkap dari situs)"
printf '%s' "$KODE" | grep -Eq '^[a-z0-9][a-z0-9-]{1,39}$' || gagal "--kode tidak sah: $KODE"
printf '%s' "$TOKEN" | grep -Eq '^[A-Za-z0-9_-]{16,64}$' || gagal "--token tidak sah (salin baris lengkap dari situs)"
case "$SITUS" in
  https://*) ;;
  http://127.0.0.1:* | http://localhost:*) ;;
  *) gagal "--situs harus https://..." ;;
esac
SITUS="${SITUS%/}"

# The user whose home holds the code: whoever ran sudo, else iris.
PENGGUNA="${SUDO_USER:-}"
[ -z "$PENGGUNA" ] || [ "$PENGGUNA" = root ] && PENGGUNA=iris
[ "$(id -u "$PENGGUNA" 2>/dev/null || echo 0)" -ge 1000 ] || gagal "pengguna $PENGGUNA tidak ada. Jalankan baris ini dari terminal pengguna desktop Pi (orangepi atau iris), bukan sebagai root."
REPO_ROOT="/home/$PENGGUNA/IRIS-ASO"

KERJA=$(mktemp -d)
trap 'rm -rf "$KERJA"' EXIT
chmod 0755 "$KERJA"

# minta <ringkas: true|false>: asks the site, the answer lands in jawab.json.
minta() {
  printf '{"tipe":"bundel_pasang","kode":"%s","token":"%s","ringkas":%s}' "$KODE" "$TOKEN" "$1" > "$KERJA/minta.json"
  curl -fsS --max-time 300 -H "Content-Type: application/json" --data @"$KERJA/minta.json" \
    "$SITUS/api/agen" -o "$KERJA/jawab.json" || gagal "situs tidak bisa dihubungi ($SITUS)"
  PESAN=$(python3 - "$KERJA" <<'PY'
import json, os, sys
j = json.load(open(os.path.join(sys.argv[1], "jawab.json")))
if not j.get("ok"):
    print({
        "token_tidak_sah": "token sudah dipakai atau habis (30 menit); buat perintah baru di situs",
        "tidak_ditemukan": "server ini tidak ada di situs",
        "bundel_belum_ada": "CI belum menerbitkan bundel",
    }.get(j.get("kode"), j.get("kode")))
PY
) || gagal "jawaban situs tidak bisa dibaca"
  [ -z "$PESAN" ] || gagal "$PESAN"
}
# baca <field>: one field of the site's answer.
baca() { python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get(sys.argv[2]) or '')" "$KERJA/jawab.json" "$1"; }

# daftar: registers this Pi's agent for the server and starts it.
daftar() {
  if [ -n "$UJI" ]; then
    IRIS_AGENT_CONFIG="$CONFIG" python3 "$AGEN_DIR/agent.py" enroll \
      --kode "$KODE" --token "$TOKEN" --server "$SITUS" --repo-root "$REPO_ROOT" || gagal "pendaftaran ditolak situs"
    echo "uji: terdaftar"
    return 0
  fi
  sudo -u iris-agent IRIS_AGENT_CONFIG="$CONFIG" python3 "$AGEN_DIR/agent.py" enroll \
    --kode "$KODE" --token "$TOKEN" --server "$SITUS" --repo-root "$REPO_ROOT" || gagal "pendaftaran ditolak situs"
  systemctl restart iris-agent.service
  sleep 3
  systemctl is-active --quiet iris-agent.service || gagal "iris-agent tidak mau berjalan: sudo journalctl -u iris-agent -n 30"
}

langkah "1/5 alat dasar"
PERLU=""
for alat in python3 openssl unzip; do
  command -v "$alat" >/dev/null 2>&1 || PERLU="$PERLU $alat"
done
if [ -n "$PERLU" ]; then
  echo "memasang:$PERLU"
  DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=600 update -y >/dev/null
  # shellcheck disable=SC2086
  DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=600 install -y $PERLU >/dev/null
fi

langkah "2/5 server \"$KODE\" di situs"
minta true
SERVER_BARU=$(baca serverId)
echo "token sah, server #$SERVER_BARU"
if [ -f "$AGEN_DIR/agent.py" ] && [ "$ULANG" -ne 1 ]; then
  ULANG_KABAR=true
fi
kabar mulai

# --- A Pi already reporting somewhere: same server goes on, another asks. ---
if [ -f "$CONFIG" ]; then
  LAMA_ID=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('serverId', ''))" "$CONFIG" 2>/dev/null || echo "")
  LAMA_SITUS=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1])).get('server', ''))" "$CONFIG" 2>/dev/null || echo "")
  if [ "$LAMA_ID" = "$SERVER_BARU" ] && [ "${LAMA_SITUS%/}" = "$SITUS" ]; then
    echo "Pi ini sudah server \"$KODE\" (#$SERVER_BARU); token baru, didaftarkan ulang."
  else
    echo "Pi ini sekarang melapor ke server #${LAMA_ID:-?} di ${LAMA_SITUS:-?}."
    echo "Kalau dipindah, Pi melapor ke \"$KODE\" (#$SERVER_BARU) dan server lama di"
    echo "situs berhenti menerima denyut dari Pi ini."
    if [ "$YA" -ne 1 ]; then
      JAWAB=""
      # Piped from curl, stdin is the script: ask on the terminal, if any.
      if (: < /dev/tty) 2>/dev/null; then
        printf 'Pindahkan Pi ini ke "%s"? Ketik ya untuk lanjut: ' "$KODE" > /dev/tty
        read -r JAWAB < /dev/tty || JAWAB=""
      fi
      [ "$JAWAB" = ya ] || gagal "dibatalkan, Pi ini tetap melapor ke server #${LAMA_ID:-?}. Tambahkan --ya untuk melewati pertanyaan ini."
    fi
  fi
  cp -p "$CONFIG" "$CONFIG.lama-$(date +%Y%m%d%H%M%S)"
fi

# --- iris-agent already installed: switch servers, reinstall nothing. ---
if [ -f "$AGEN_DIR/agent.py" ] && [ "$ULANG" -ne 1 ]; then
  langkah "3/5 iris-agent sudah terpasang, tidak dipasang ulang"
  langkah "4/5 lewati pemasangan (pembaruan kode lewat tombol Perbarui di situs)"
  langkah "5/5 daftarkan ke situs"
  kabar daftar
  daftar
  printf '\nSelesai. Pi ini sekarang server "%s" dan mengirim denyut; lihat halaman Server di situs.\n' "$KODE"
  exit 0
fi

# --- A fresh Pi (or --pasang-ulang): the whole install. ---
langkah "3/5 bundel dari situs"
kabar bundel
minta false
# The bundle's own key (the same as agent/bundel.pub and the site's).
cat > "$KERJA/bundel.pub" <<'KUNCI'
-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAFQ2KYNT9tPyJC52+GY5cGnNESAHH00MiEqvMb4xXhdM=
-----END PUBLIC KEY-----
KUNCI
# Tests only: a bundle signed with a throwaway key.
if [ -n "$UJI" ] && [ -n "${IRIS_PASANG_KUNCI:-}" ]; then
  cp "$IRIS_PASANG_KUNCI" "$KERJA/bundel.pub"
fi
python3 - "$KERJA" <<'PY' || gagal "bundel rusak di jalan, jalankan perintahnya lagi"
import base64, hashlib, json, os, sys
d = sys.argv[1]
j = json.load(open(os.path.join(d, "jawab.json")))
isi = base64.b64decode(j["isi"])
if hashlib.sha256(isi).hexdigest() != j["sha256"]:
    sys.exit(1)
open(os.path.join(d, "bundel.zip"), "wb").write(isi)
open(os.path.join(d, "bundel.sig"), "wb").write(base64.b64decode(j["tanda"]))
print(f"bundel IRIS ASO {j['aso']}, iris-iot {j['iot']} ({len(isi)} byte)")
PY
openssl pkeyutl -verify -pubin -inkey "$KERJA/bundel.pub" -rawin -in "$KERJA/bundel.zip" \
  -sigfile "$KERJA/bundel.sig" >/dev/null 2>&1 || gagal "tanda tangan bundel tidak sah, tidak dipasang"
echo "tanda tangan sah"

# A Pi with no network time (a hotspot that blocks NTP) takes the site's.
WAKTU=$(baca waktu | cut -d. -f1)
SELISIH=$(( ${WAKTU:-0} - $(date +%s) ))
[ "$SELISIH" -lt 0 ] && SELISIH=$((0 - SELISIH))
if [ "${WAKTU:-0}" -gt 0 ] && [ "$SELISIH" -gt 30 ] && [ -z "$UJI" ]; then
  if [ "$(timedatectl show -p NTPSynchronized --value 2>/dev/null || echo no)" != yes ]; then
    date -s "@$WAKTU" >/dev/null && echo "jam Pi selisih ${SELISIH} detik, disetel dari situs"
  fi
fi

langkah "4/5 pasang (bundel ke $REPO_ROOT, lalu provisioning)"
kabar pasang
chmod 0644 "$KERJA/bundel.zip"
runuser -u "$PENGGUNA" -- sh -c 'mkdir -p "$1" && rm -rf "$1/modul4/src" && unzip -oq "$2" -d "$1"' \
  sh "$REPO_ROOT" "$KERJA/bundel.zip" || gagal "bundel tidak bisa dibuka ke $REPO_ROOT"
if [ -n "$UJI" ]; then
  AGEN_DIR="$REPO_ROOT/agent"
  echo "uji: provisioning dilewati"
else
  KONSOL_RELAY=$(baca relay)
  # IRIS_FROM_SITE: provisioning leaves out the manual enrol and preflight
  # steps, since this script enrols next and the site runs the Ready check.
  IRIS_FROM_SITE=1
  export KONSOL_RELAY IRIS_FROM_SITE
  if ! sh "$REPO_ROOT/scripts/opi_provision.sh" --repo-root "$REPO_ROOT"; then
    TERAKHIR=$(grep '^== ' /var/log/iris-provision.log 2>/dev/null | tail -1 | sed 's/^== //; s/ ==$//')
    gagal "provisioning berhenti di \"${TERAKHIR:-?}\"; log lengkap di Pi: /var/log/iris-provision.log"
  fi
fi

langkah "5/5 daftarkan ke situs"
kabar daftar
daftar
printf '\nSelesai. "%s" terpasang dan mengirim denyut. Kembali ke situs, sisanya dari sana.\n' "$KODE"
