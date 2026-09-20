#!/bin/sh
# IRIS IoT practicum site — installs the Phase 2 agent on the Orange Pi.
#
#   sudo ./agent/install.sh [--repo-root /path/to/IRIS-ASO]
#
# Creates the unprivileged iris-agent user, writes a sudoers file naming
# the EXACT commands commands.py's whitelist can ever build (no wildcards —
# an entry that matched "systemctl * anything.service" would authorise
# every unit on the box, not the four this project actually runs), copies
# the agent into /opt/iris-agent, and installs+enables the systemd unit.
#
# Does NOT run enrollment — that needs the one-time token from the
# dashboard's "Daftarkan Pi" flow, which does not exist until after this
# script has put the agent somewhere it can be run from. Enrol separately:
#   sudo -u iris-agent python3 /opt/iris-agent/agent.py enroll \
#     --kode <kode> --token <token> --server https://<domain-or-vercel-url>

set -eu

REPO_ROOT="/home/iris/IRIS-ASO"
while [ $# -gt 0 ]; do
  case "$1" in
    --repo-root) REPO_ROOT="$2"; shift 2 ;;
    *) echo "argumen tidak dikenal: $1" >&2; exit 1 ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "Jalankan dengan sudo." >&2
  exit 1
fi

HERE="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="/opt/iris-agent"

echo "Membuat pengguna iris-agent (tanpa shell login, tanpa home)..."
id -u iris-agent >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin iris-agent

echo "Menyalin agen ke $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
cp "$HERE/agent.py" "$HERE/collectors.py" "$HERE/commands.py" "$INSTALL_DIR/"
chown -R root:root "$INSTALL_DIR"
chmod 755 "$INSTALL_DIR"

mkdir -p /etc/iris-agent /var/lib/iris-agent
chown iris-agent:iris-agent /etc/iris-agent /var/lib/iris-agent
chmod 700 /etc/iris-agent /var/lib/iris-agent

echo "Menulis sudoers untuk iris-agent (perintah tetap, tanpa wildcard)..."
SUDOERS_TMP="$(mktemp)"
cat > "$SUDOERS_TMP" <<SUDOERS
# Ditulis oleh agent/install.sh. Setiap baris adalah satu perintah persis
# yang bisa dibangun commands.py -- lihat build_argv() di sana. Menambah
# baris di sini tanpa menambah kasusnya di commands.py tidak berguna
# (argv itu tidak akan pernah dibangun); menghapus baris di sini tanpa
# menghapus kasusnya di commands.py membuat perintah itu selalu gagal.
iris-agent ALL=(root) NOPASSWD: /usr/bin/systemctl start mosquitto.service
iris-agent ALL=(root) NOPASSWD: /usr/bin/systemctl stop mosquitto.service
iris-agent ALL=(root) NOPASSWD: /usr/bin/systemctl restart mosquitto.service
iris-agent ALL=(root) NOPASSWD: /usr/bin/systemctl start iris-modul2-ws.service
iris-agent ALL=(root) NOPASSWD: /usr/bin/systemctl stop iris-modul2-ws.service
iris-agent ALL=(root) NOPASSWD: /usr/bin/systemctl restart iris-modul2-ws.service
iris-agent ALL=(root) NOPASSWD: /usr/bin/systemctl start modul4.service
iris-agent ALL=(root) NOPASSWD: /usr/bin/systemctl stop modul4.service
iris-agent ALL=(root) NOPASSWD: /usr/bin/systemctl restart modul4.service
iris-agent ALL=(root) NOPASSWD: /usr/bin/systemctl start chirpstack.service
iris-agent ALL=(root) NOPASSWD: /usr/bin/systemctl stop chirpstack.service
iris-agent ALL=(root) NOPASSWD: /usr/bin/systemctl restart chirpstack.service
iris-agent ALL=(root) NOPASSWD: /usr/bin/systemctl restart systemd-timesyncd.service
iris-agent ALL=(root) NOPASSWD: $REPO_ROOT/scripts/opi_ap_on.sh
iris-agent ALL=(root) NOPASSWD: $REPO_ROOT/scripts/opi_ap_off.sh
SUDOERS

visudo -c -f "$SUDOERS_TMP" || { echo "sudoers yang dihasilkan tidak sah, dibatalkan." >&2; rm -f "$SUDOERS_TMP"; exit 1; }
install -m 0440 -o root -g root "$SUDOERS_TMP" /etc/sudoers.d/iris-agent
rm -f "$SUDOERS_TMP"

echo "Memasang layanan systemd..."
cp "$HERE/iris-agent.service" /etc/systemd/system/iris-agent.service
systemctl daemon-reload
systemctl enable iris-agent.service

echo
echo "Terpasang, tetapi BELUM terdaftar dan belum berjalan."
echo "Daftarkan agen ini dengan token dari dasbor, lalu jalankan layanannya:"
echo
echo "  sudo -u iris-agent IRIS_AGENT_CONFIG=/etc/iris-agent/config.json \\"
echo "    python3 $INSTALL_DIR/agent.py enroll --kode <kode> --token <token> \\"
echo "    --server https://<domain-atau-url-vercel> --repo-root $REPO_ROOT"
echo "  sudo systemctl start iris-agent.service"
