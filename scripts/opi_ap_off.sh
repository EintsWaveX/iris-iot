#!/bin/sh
# Mengembalikan Orange Pi 4 PRO menjadi client Wi-Fi biasa setelah Modul 4
# Part A selesai, sehingga Modul 2, Modul 3, dan Modul 4 Part B dapat
# berjalan lagi seperti sedia kala.
#
#   sudo ./scripts/opi_ap_off.sh

set -eu

IFACE="${IFACE:-wlan0}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Jalankan dengan sudo." >&2
  exit 1
fi

echo "Menghentikan access point..."
pkill hostapd 2>/dev/null || true
systemctl stop dnsmasq 2>/dev/null || true

rm -f /etc/hostapd/iris-hunt.conf /etc/dnsmasq.d/iris-hunt.conf

echo "Melepas alamat statis dari $IFACE..."
ip addr flush dev "$IFACE"
ip link set "$IFACE" down
ip link set "$IFACE" up

echo "Menyalakan kembali layanan client Wi-Fi..."
systemctl start NetworkManager 2>/dev/null || systemctl start wpa_supplicant 2>/dev/null || true

echo
echo "Orange Pi kembali menjadi client Wi-Fi."
echo "Setelah tersambung ke Internet, selaraskan lagi jamnya:"
echo "  sudo systemctl restart systemd-timesyncd && timedatectl status"
