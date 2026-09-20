#!/bin/sh
# Menjadikan Orange Pi 4 PRO sebagai access point "IRIS-IOT" untuk
# Modul 4 Part A (Perburuan LoRa).
#
# Satu antarmuka wlan0 tidak dapat menjadi access point dan client sekaligus,
# sedangkan Modul 2, Modul 3, dan Modul 4 Part B menjalankan Pi ini sebagai
# client Wi-Fi kampus. Karena itu Part A harus dijadwalkan pada sesi
# tersendiri, dan mode Pi dikembalikan sesudahnya dengan opi_ap_off.sh.
#
#   sudo ./scripts/opi_ap_on.sh
#
# Sebelum menjalankan ini, setel dulu jam Pi selagi masih ada Internet:
# hotspot yang dihasilkan tidak punya jalur keluar, dan Pi inilah yang menjadi
# sumber waktu bagi Beacon maupun seluruh Hunter.

set -eu

IFACE="${IFACE:-wlan0}"
SSID="${SSID:-IRIS-IOT}"
PSK="${PSK:-iris2026}"
ADDR="${ADDR:-192.168.4.1}"
CIDR="${CIDR:-24}"
DHCP_FROM="${DHCP_FROM:-192.168.4.10}"
DHCP_TO="${DHCP_TO:-192.168.4.60}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Jalankan dengan sudo." >&2
  exit 1
fi

for tool in hostapd dnsmasq ip; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "Paket '$tool' belum terpasang. Jalankan:" >&2
    echo "  sudo apt install hostapd dnsmasq" >&2
    exit 1
  }
done

echo "Menghentikan layanan client Wi-Fi pada $IFACE..."
systemctl stop wpa_supplicant 2>/dev/null || true
systemctl stop NetworkManager 2>/dev/null || true

cat > /etc/hostapd/iris-iot.conf <<CONF
interface=$IFACE
driver=nl80211
ssid=$SSID
hw_mode=g
channel=6
wmm_enabled=1
auth_algs=1
wpa=2
wpa_passphrase=$PSK
wpa_key_mgmt=WPA-PSK
rsn_pairwise=CCMP
CONF

cat > /etc/dnsmasq.d/iris-iot.conf <<CONF
interface=$IFACE
bind-interfaces
dhcp-range=$DHCP_FROM,$DHCP_TO,12h
dhcp-option=option:router,$ADDR
dhcp-option=option:dns-server,$ADDR
dhcp-option=option:ntp-server,$ADDR
CONF

echo "Memberi alamat statis $ADDR/$CIDR pada $IFACE..."
ip link set "$IFACE" down
ip addr flush dev "$IFACE"
ip addr add "$ADDR/$CIDR" dev "$IFACE"
ip link set "$IFACE" up

echo "Menyalakan dnsmasq dan hostapd..."
systemctl restart dnsmasq
hostapd -B /etc/hostapd/iris-iot.conf

# Boleh gagal kalau chrony/ntpsec tidak terpasang; NTP lewat dnsmasq hanya
# mengumumkan alamatnya, server waktunya sendiri yang harus berjalan.
systemctl restart chrony 2>/dev/null || systemctl restart ntpsec 2>/dev/null || \
  echo "Peringatan: tidak ada server NTP yang berjalan. Papan tidak akan dapat" \
       "menyelaraskan jamnya, dan kolom delay pada jurnal akan kosong." >&2

echo
echo "Access point '$SSID' aktif pada $ADDR."
echo "Jalankan papan skornya:  python modul4/server.py"
echo "Lalu buka:               http://$ADDR:8080"
