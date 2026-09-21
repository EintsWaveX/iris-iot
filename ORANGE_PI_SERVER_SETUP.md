# IRIS IoT Practicum — Orange Pi & Server Setup

This is the complete, self-contained guide to bring up the Orange Pi 4 PRO that
hosts Modules 2, 3, and 4 of the IRIS IoT practicum, plus the Phase 2
monitoring agent that reports the Pi's health to the web dashboard at
`https://iris-praktikum-jurnal.vercel.app`. Every script and config file it
references is bundled alongside this document in the same handoff package.

A second, unrelated guide (a Tailscale bridge for reaching Telkom University's
SEE Labs from outside campus) is appended at the very bottom of this file as
its own section — it has nothing to do with the practicum, it's just riding
along in the same file.

---

## 1. What you're building

```
                          ┌─────────────────────────────────────┐
                          │        Orange Pi 4 PRO (Ubuntu)      │
  ESP32 (DHT22)  ───WS───▶│  iris-modul2-ws.service   :8765      │
  ESP32 (DHT22)  ───WS───▶│                                       │
                          │                                       │
  Pico W (pot)   ──MQTT──▶│  mosquitto.service        :1883      │
  Pico W (pot)   ──MQTT──▶│                                       │
                          │                                       │
  1× Beacon      ─LoRa─┐  │                                       │
  6× Hunter      ─LoRa─┼─▶│  modul4.service           :8080      │
                        │  │  (also runs the Pi as Wi-Fi AP       │
                        │  │   "IRIS-IOT" during Module 4)        │
                          │                                       │
                          │  iris-agent.service                   │
                          │  (heartbeat + commands, outbound-only)│
                          └──────────────┬────────────────────────┘
                                         │ HTTPS, outbound only
                                         ▼
                          https://iris-praktikum-jurnal.vercel.app
                          (dashboard, already live — nothing to deploy)
```

Three practicum services (Module 2, 3, 4) plus one monitoring agent, all on
one Ubuntu box. The web dashboard is **already deployed and live** — this
guide is entirely about the physical Pi side; you are not standing up any
part of the website.

Module 4's Wi-Fi hotspot mode and Modules 2/3's "Pi joins the lab Wi-Fi as a
client" mode are mutually exclusive (one radio, `wlan0`, can't be both an
access point and a client at once) — this is called out again in section 5.

---

## 2. Hardware checklist

| Item | Qty | Notes |
|---|---|---|
| Orange Pi 4 PRO | 1 | Runs Ubuntu (server image, no desktop needed) |
| microSD card (or eMMC module) | 1 | 16 GB minimum, 32 GB+ recommended |
| 5V/3A-class USB-C power supply | 1 | Match whatever the board's official supply spec is |
| Ethernet cable | 1 | For first-boot internet access / a wired uplink |
| ESP32 dev boards | 3 | Modules 1 and 2 |
| Raspberry Pi Pico W | 2 | Module 3 |
| Cosmic LoRa Aurora V2 boards + 920 MHz SMA antennas | 7 (1 beacon + 6 hunters) | Module 4 — **never power one without its antenna attached**, it will damage the radio |
| DHT22 sensors | up to 7 | Module 2 |
| 10 kΩ potentiometers | up to 12 | Modules 1 and 3 |
| A monitor + keyboard, or another PC on the same LAN | 1 | Only needed if SSH isn't reachable yet |

---

## 3. Flash Ubuntu and first boot

1. Download the **Ubuntu (Jammy/22.04) server image for the Orange Pi 4 PRO**
   from Orange Pi's own official downloads for that exact board model — not a
   generic "Orange Pi 4" image, the 4 PRO has different DRAM/eMMC wiring.
2. Flash it to the microSD/eMMC with balenaEtcher (or `dd` on Linux/macOS).
3. Boot the Pi with Ethernet plugged into a network with internet access
   (needed once, for `apt` packages below).
4. Log in (serial console, HDMI+keyboard, or SSH once you find its DHCP
   address on your router). Default credentials on Orange Pi's Ubuntu images
   are typically `orangepi` / `orangepi`, and you'll be forced to set a new
   password on first login — do that now, don't skip it.
5. Basic housekeeping:

   ```bash
   sudo apt update && sudo apt full-upgrade -y
   sudo hostnamectl set-hostname iris-pi
   sudo timedatectl set-timezone Asia/Jakarta
   sudo systemctl enable --now ssh
   ```

6. Everything below runs under the Pi's own `orangepi` account (the one the
   Ubuntu image already created — see step 4) rather than a separate
   dedicated user; the practicum scripts, the agent's sudoers file, and this
   whole guide all hardcode `/home/orangepi/IRIS-ASO`. Make sure it can
   `sudo` (Orange Pi's default images usually already grant this):

   ```bash
   sudo usermod -aG sudo orangepi
   ```

   From here on, run everything as the `orangepi` user unless a command is
   explicitly shown with `sudo` for a root-only step.

---

## 4. Install system packages

```bash
sudo apt install -y \
  python3 python3-venv python3-pip \
  git unzip \
  mosquitto mosquitto-clients \
  hostapd dnsmasq \
  chrony
```

- **`mosquitto`** installs and starts as `mosquitto.service` automatically —
  no unit file to write, it's already what `agent/commands.py`'s whitelist
  expects.
- **`hostapd`/`dnsmasq`** are only used while Module 4 turns the Pi into the
  `IRIS-IOT` access point (section 6.3) — Modules 2/3 don't need them running.
- **`chrony`** is the NTP daemon. It matters more than it looks: every module
  in this practicum measures **latency**, by comparing wall-clock timestamps
  on two devices, so a Pi with a wrong or unreachable clock quietly makes
  every delay figure in the journal wrong. Two things need fixing in
  `/etc/chrony/chrony.conf` before it's actually usable during Module 4 (the
  hotspot has no path to the internet, so the Pi has to serve time to the
  boards using its *own* clock, not relay an upstream server):

  ```bash
  sudo tee -a /etc/chrony/chrony.conf > /dev/null <<'EOF'

  # IRIS IoT practicum: serve time to boards on the IRIS-IOT hotspot even
  # though that hotspot has no internet path. Without `local stratum 10`,
  # chrony refuses to answer NTP requests once it decides its own clock is
  # unsynchronised, which is exactly the state it's in during Module 4.
  allow 192.168.4.0/24
  local stratum 10
  EOF
  sudo systemctl restart chrony
  ```

  While the Pi still has internet (before Module 4's AP mode), let chrony
  sync once so the Pi's own clock is right in the first place:

  ```bash
  chronyc tracking   # confirm "Leap status: Normal" and a small "System time" offset
  ```

Mosquitto's default config on Ubuntu **refuses anonymous connections**, but
Module 3's Pico W publishers/subscribers don't authenticate — they just
connect to port 1883. Allow anonymous access on this listener (the hotspot
this runs on is a closed network for the length of one practicum session, the
same trust model the web dashboard's NIM-based login already uses):

```bash
sudo tee /etc/mosquitto/conf.d/iris.conf > /dev/null <<'EOF'
listener 1883 0.0.0.0
allow_anonymous true
EOF
sudo systemctl restart mosquitto
```

Verify it actually works, don't just trust that the service is "active":

```bash
mosquitto_sub -h localhost -t 'iris/+/pot' -v &
mosquitto_pub -h localhost -t 'iris/grup1/pot' -m 'test'
# you should see: iris/grup1/pot test
```

---

## 5. Get the code onto the Pi

Copy the ZIP this guide shipped in onto the Pi (`scp`, a USB stick, whatever's
convenient) and unpack it to the exact path the services below expect:

```bash
mkdir -p /home/orangepi/IRIS-ASO
unzip iris-pi-server-setup.zip -d /home/orangepi/IRIS-ASO
cd /home/orangepi/IRIS-ASO
ls    # agent/  modul4/  kunci_jawaban/  scripts/  ORANGE_PI_SERVER_SETUP.md
```

`kunci_jawaban/` here is the **complete** answer-key set for all four modules,
both languages (`id/` and `en/`) — including Module 1's BLE sketches, which
are included for completeness even though Module 1 is pure ESP32-to-ESP32
BLE and never touches the Pi at all. Every file in it has been compile- or
run-verified (section 12 lists exactly how, per file type); none of them are
the fill-in-the-blank `kode_praktikum/` versions, which won't run as-is.

(If you'd rather clone the full project repository instead of the trimmed
ZIP, that works too — the paths inside it are the same. The ZIP just leaves
out the journals/images/answer keys for the other modules that this Pi never
touches.)

---

## 6. Python environment

One virtual environment, shared by Modules 2 and 4 (Module 3 needs no Python
on the Pi side — mosquitto is a system daemon, not a Python process):

```bash
python3 -m venv /home/orangepi/venv-iris
source /home/orangepi/venv-iris/bin/activate
pip install --upgrade pip
pip install "websockets>=13"
deactivate
```

That's the only third-party dependency either service needs.

---

## 7. Module 2 — WebSocket ingest server

The actual server that runs here is the **completed** reference
implementation from `kunci_jawaban/`, not the fill-in-the-blank version
students edit (`kode_praktikum/`) — that one has literal `________` blanks in
it and will not run. `kunci_jawaban/id/modul2_websocket_server.py` listens on
port `8765` and accepts `/grup1`–`/grup8`.

Install its systemd unit (already written for this exact path/venv):

```bash
sudo cp /home/orangepi/IRIS-ASO/agent/iris-modul2-ws.service /etc/systemd/system/
sudo systemctl daemon-reload
```

Don't `enable` it yet — see section 9 for why these three practicum services
are started on demand, not at boot.

---

## 8. Module 3 — Mosquitto broker

Unlike Module 2, there's no custom server process to install here — the
broker is the stock `mosquitto` package, already installed and configured in
section 4. The actual `modul3_mqtt_publish.py` / `modul3_mqtt_subscribe.py`
code (bundled at `kunci_jawaban/{id,en}/`) is **MicroPython**, written for the
Pico W's own runtime (`network`, `umqtt.simple`, `ntptime` — none of which
exist in a normal desktop Python). It does not run on the Pi at all, and
can't be exercised with `pip install` + `python3` the way Module 2's server
can. They're included in this package purely as the reference/answer-key
source an assistant flashes onto the two Pico W boards via Thonny, matching
`kunci_jawaban/README.md`'s own scope for these files.

On practicum day, an assistant can watch every group's traffic at once
straight from the Pi, with no Pico W required to prove the broker itself
works:

```bash
mosquitto_sub -h localhost -t 'iris/+/pot' -v &
mosquitto_pub -h localhost -t 'iris/grup1/pot' -m '1 42'
# you should see: iris/grup1/pot 1 42
```

That's the actual end-to-end verification available without hardware — it
exercises the real broker Module 3 depends on. The only way to verify
`modul3_mqtt_publish.py`/`modul3_mqtt_subscribe.py` themselves is to flash
them to real Pico W boards; there's no faithful way to run MicroPython-only
code on the server.

---

## 9. Module 4 — LoRa hunt scoreboard + Wi-Fi hotspot

### 9.1 Build the scoreboard's static assets

```bash
source /home/orangepi/venv-iris/bin/activate
python /home/orangepi/IRIS-ASO/modul4/build.py     # generates modul4/public/index.html
deactivate
```

Re-run this any time `modul4/src/**` changes — the server serves whatever's
already in `modul4/public/`, it doesn't rebuild automatically.

### 9.2 Install its systemd unit

```bash
sudo cp /home/orangepi/IRIS-ASO/agent/modul4.service /etc/systemd/system/
sudo systemctl daemon-reload
```

`modul4.service` runs `python modul4/server.py --arena 300` — `300` is a
sensible default for open ground around a large building (see
`modul4/SETUP.md` for the full table of `--arena`/`BEACON_TX_POWER` pairings
if the venue changes).

### 9.3 Turn the Pi into the `IRIS-IOT` access point

This is the one step that's mutually exclusive with Modules 2/3 acting as a
normal Wi-Fi client — only do this right before running Module 4, and revert
it right after:

```bash
sudo /home/orangepi/IRIS-ASO/scripts/opi_ap_on.sh     # brings up IRIS-IOT / iris2026 at 192.168.4.1
# ... run the module 4 session ...
sudo /home/orangepi/IRIS-ASO/scripts/opi_ap_off.sh    # returns wlan0 to a normal Wi-Fi client
```

`opi_ap_on.sh` also restarts chrony so it can serve time to the hunt boards —
this only actually works because of the `allow`/`local stratum` lines added
in section 4; without them the boards' delay columns come back blank.

**Set the Pi's clock before switching to AP mode, while it still has
internet** — the hotspot has no path out, so whatever time the Pi has at that
moment is the time every Beacon/Hunter will sync to:

```bash
sudo systemctl restart chrony && chronyc tracking
```

---

## 10. Phase 2 monitoring agent

This is what makes the Pi show up on the web dashboard — CPU/memory/disk/
clock-sync/service status, plus the ability to start/stop/restart the three
services above from the dashboard instead of SSHing in.

### 10.1 Install

```bash
cd /home/orangepi/IRIS-ASO
sudo ./agent/install.sh --repo-root /home/orangepi/IRIS-ASO
```

This creates an unprivileged `iris-agent` system user, writes a sudoers file
naming the **exact** systemctl commands it's allowed to run (no wildcards —
see the comment at the top of `agent/install.sh` for why that matters), and
installs `iris-agent.service` (not yet started — it has nothing to enrol
with yet).

### 10.2 Register this Pi on the dashboard

From a browser, as an assistant:

1. Log into `https://iris-praktikum-jurnal.vercel.app` with an assistant NIM.
2. Open the **Server** tab in the dashboard.
3. Click **Daftarkan Pi**, give it a name and a short code.
4. The dashboard shows a one-time enrollment command that looks like:

   ```
   iris-agent enroll --kode <kode> --token <token> --server https://iris-praktikum-jurnal.vercel.app
   ```

   Run the **real** equivalent on the Pi (there's no `iris-agent` binary on
   PATH — it's a Python script run under the dedicated user):

   ```bash
   sudo -u iris-agent IRIS_AGENT_CONFIG=/etc/iris-agent/config.json \
     python3 /opt/iris-agent/agent.py enroll --kode <kode> --token <token> \
     --server https://iris-praktikum-jurnal.vercel.app --repo-root /home/orangepi/IRIS-ASO
   ```

   The token is single-use and expires in 30 minutes — if it's already
   consumed or expired, register a new Pi entry on the dashboard rather than
   retrying the same token.

5. Start the agent:

   ```bash
   sudo systemctl start iris-agent.service
   sudo systemctl status iris-agent.service   # should be "active (running)"
   ```

6. Refresh the dashboard's Server tab — this Pi should now show as online
   within about 15 seconds (that's the agent's heartbeat interval while a
   practicum session is running; it backs off to every 10 minutes when idle,
   deliberately, so it doesn't hold the database's free-tier compute awake
   between practicum days).

---

## 11. Starting a practicum session

The three services aren't set to auto-start at boot on purpose — a service
sitting there listening for a practicum module nobody's running that day is
just attack surface and a battery/CPU cost for nothing. Start only what
today's session needs, either by SSHing in:

```bash
sudo systemctl start iris-modul2-ws.service   # Module 2
sudo systemctl start mosquitto.service        # Module 3 (usually already running — it's enabled by default)
sudo systemctl start modul4.service           # Module 4 (needs opi_ap_on.sh too — section 9.3)
```

...or, once the agent is enrolled (section 10), from the dashboard's Server
page — that's the whole point of Phase 2: no terminal needed for routine
start/stop/restart once it's set up once.

---

## 12. Verification checklist

### Already verified before this package was sent

Every `kunci_jawaban/` file was checked before packaging, not just assumed to
work because it's the "answer key":

| File(s) | How | Result |
|---|---|---|
| `modul1_ble_central.ino`, `modul1_ble_peripheral.ino` (id + en) | `arduino-cli compile --fqbn esp32:esp32:esp32` | Clean, 85%/85% flash |
| `modul2_websocket_esp32.ino` (id + en) | Same | Clean, 83% flash |
| `modul2_websocket_server.py` (id) | Actually run: started the server, connected a fake client to `/grup1`, sent a real reading, confirmed a correct `{"seq":1,"at":"..."}` reply | Passed, real round-trip |
| `modul3_mqtt_publish.py`, `modul3_mqtt_subscribe.py` (id + en) | `python -m py_compile` (syntax only — these are MicroPython for the Pico W and cannot run on desktop Python; see section 8) | Syntax valid |
| `modul4/{id,en}/grup1-7/beacon.ino`, `hunter.ino` | Same `arduino-cli compile` | **16 of 28 compiled clean** (all 7 `id/` group pairs + `en/grup1`) before the compile job was cut off by a host memory limit. The remaining `en/grup2`–`grup7` (12 files) are generated from the same template as the ones already verified (`scripts/gen_modul4.py`) and differ only by a `GROUP_ID` number — not independently compiled, on the assumption that risk is low given the template generation. If you want certainty rather than that inference, compile them yourself before flashing: `arduino-cli compile --fqbn esp32:esp32:esp32 kunci_jawaban/en/modul4/grup2` (repeat for grup3–7). |

Don't take a green `systemctl status` as proof anything actually works end to
end once it's running on the Pi — verify each layer there too:

- [ ] `chronyc tracking` shows `Leap status: Normal` **before** switching to AP mode.
- [ ] `mosquitto_pub`/`mosquitto_sub` round-trips a test message (section 4).
- [ ] A real ESP32 flashed with `kunci_jawaban/id/modul2_websocket_esp32.ino`-equivalent (or a student's board) shows up in `iris-modul2-ws.service`'s logs: `sudo journalctl -u iris-modul2-ws.service -f`.
- [ ] `python modul4/tools/uji_protokol.py --token <token>` passes all checks against a running `modul4/server.py` (start the server with `--token UJICOBA` first, then run this — see `modul4/SETUP.md` section 5 for the exact pair of commands). This is the same style of protocol test the web app's CI already trusts — it exercises every message type, not just "does the process start."
- [ ] `python agent/tools/uji_protokol.py` passes against the deployed dashboard (enrol/heartbeat/command flow) — run this from the Pi once the agent is enrolled.
- [ ] The dashboard's Server tab shows this Pi **online**, with a recent heartbeat, correct CPU/mem/temp numbers, and clock-sync marked good.
- [ ] From the dashboard, send a `layanan.mulai_ulang` (restart) command against `mosquitto` and confirm it's reflected in `sudo journalctl -u iris-agent.service -f` and in mosquitto's own restart timestamp — this proves the whole command channel, not just the heartbeat half.

---

## 13. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Boards never appear in `iris-modul2-ws.service` logs | Pi is still in AP mode (`opi_ap_off.sh` not run), or the board's `WS_PATH` isn't in `ALLOWED_PATHS` |
| `mosquitto_pub` works locally but Pico W never connects | `allow_anonymous true` / `listener 1883 0.0.0.0` missing from `/etc/mosquitto/conf.d/iris.conf`, or firewall blocking 1883 |
| Module 4 scoreboard shows "Papan skor belum dibangun" | `modul4/build.py` wasn't run — see section 9.1 |
| Hunt boards' delay column is always blank | Pi's clock wasn't set before `opi_ap_on.sh`, or `chrony.conf` is missing the `allow`/`local stratum` lines from section 4 |
| Dashboard never shows the Pi online after enrollment | `iris-agent.service` isn't running (`systemctl status iris-agent.service`), or the Pi has no outbound HTTPS route to Vercel |
| A dashboard command silently never completes | The agent only reports command results on its *next* heartbeat — wait one interval (15s active / 10min idle) before assuming it's stuck |
| `visudo -c` fails during `install.sh` | Something hand-edited `/etc/sudoers.d/iris-agent` after a previous install — remove it and re-run `install.sh` |

For everything specific to the hunt game itself (arena sizing, calibration,
claim review, session scheduling) see `modul4/SETUP.md`, which ships in the
same package.

---

## 14. Security notes (don't skip these)

- The agent runs as an **unprivileged** `iris-agent` system user with **no
  login shell**. It can only run the exact `systemctl`/script invocations
  named in `/etc/sudoers.d/iris-agent` — nothing else, no wildcards.
- The agent's connection to the dashboard is **outbound-only**: it polls,
  it never listens on a port reachable from outside. There's nothing to port-
  forward and nothing to expose on the router.
- The enrollment token is single-use and short-lived by design — if you think
  it leaked, just register a fresh Pi entry rather than trying to "revoke" the
  old token.
- The `IRIS-IOT` hotspot password (`iris2026`) and the assistant/practikan
  login model are an **accountability model, not a secrecy one** (see
  `web/src/lib/auth.ts`'s header comment) — this is intentional for a
  closed-network, single-day practicum, not an oversight to "fix" on the Pi
  side.

---

## Appendix — Accessing Telkom University SEE Labs from outside campus WiFi

*(Separate context — nothing below this line has anything to do with the
IRIS IoT practicum above. It's a standalone guide for reaching
`seelabs.telkomuniversity.ac.id` from anywhere, using a small always-on
bridge device and Tailscale.)*

A guide to reaching `seelabs.telkomuniversity.ac.id` from any network (home,
mobile data, another country) by building a small permanent bridge into the
campus network, using [Tailscale](https://tailscale.com) as the overlay VPN.

### Why this is needed

`seelabs.telkomuniversity.ac.id` resolves to a **private IP address**
(`10.252.252.57`), served by Tel-U's own internal DNS
(`ns4.edge.telkomuniversity.ac.id`). Private IPs aren't routable over the
public internet — the hostname only works while your device's WiFi/LAN
places it inside Tel-U's network. There is no public VPN service documented
for Tel-U covering general internal apps (their only published remote-access
product, MyLOFT, is scoped to e-journal/library access only), so the
practical option is to host our own bridge.

**The idea:** leave a small always-on device physically connected to campus
WiFi/LAN. Install Tailscale on it and turn it into a *subnet router* that
advertises a route to the internal server. Any other device you own, anywhere
in the world, joins the same private Tailscale network ("tailnet") and gets
routed straight to that internal IP through the bridge — the same pattern
people use to reach a home NAS remotely.

```
[Your laptop, anywhere] --Tailscale (encrypted, NAT-traversed)--> [Pi bridge on campus WiFi] --local campus network--> [10.252.252.57 seelabs]
```

### Prerequisites

- A small device you can leave running 24/7 on campus: a Raspberry Pi (even a
  Zero 2 W works), an old laptop, or a spare mini PC.
- Valid Tel-U network credentials (SSO username/password) for that device to
  join campus WiFi, or a wired LAN jack in a lab/room if available (simpler
  and more reliable than WiFi).
- A free [Tailscale](https://tailscale.com) account (sign in with
  Google/GitHub/Microsoft/email — free tier covers this easily).
- Tailscale installed on whichever devices you want to browse from (laptop,
  phone, etc).

### Step 1 — Flash the bridge device

Use **Raspberry Pi OS Lite** (headless, no desktop environment) for the
smallest possible footprint. Enable SSH during imaging (Raspberry Pi Imager
→ gear icon → "Enable SSH") so you never need a monitor/keyboard.

### Step 2 — Connect the bridge to campus WiFi

Most `.ac.id` campus WiFi (including eduroam-style networks) uses
**WPA2-Enterprise (802.1X)** with PEAP/MSCHAPv2, authenticated against your
SSO credentials — not a simple shared password.

Edit `/etc/wpa_supplicant/wpa_supplicant.conf` on the Pi:

```
network={
    ssid="<campus-SSID>"
    key_mgmt=WPA-EAP
    eap=PEAP
    identity="<your-NIM-or-username>"
    password="<your-SSO-password>"
    phase2="auth=MSCHAPV2"
}
```

Restart networking (or reboot) and confirm the Pi gets a campus IP:

```bash
sudo systemctl restart wpa_supplicant
ip addr show wlan0
```

If a wired Ethernet jack is available in a lab or room, use that instead —
skip WiFi entirely, plug in, and DHCP should hand out a campus IP
automatically. Wired is far more resilient for a device that needs to stay
online unattended.

### Step 3 — Install Tailscale on the bridge

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --advertise-routes=10.252.252.57/32 --hostname=telkom-bridge
```

Note the route is scoped to just `10.252.252.57/32` — the single host we
need — rather than the whole `/24` subnet. This keeps the bridge's exposure
minimal; you can widen it later (e.g. to `10.252.252.0/24`) if you find you
need other internal Tel-U services, by re-running `tailscale up` with a
broader `--advertise-routes`.

Enable IP forwarding so the Pi can actually forward traffic between
Tailscale and the campus LAN:

```bash
echo 'net.ipv4.ip_forward = 1' | sudo tee /etc/sysctl.d/99-tailscale.conf
echo 'net.ipv6.conf.all.forwarding = 1' | sudo tee -a /etc/sysctl.d/99-tailscale.conf
sudo sysctl -p /etc/sysctl.d/99-tailscale.conf
```

### Step 4 — Approve the advertised route

Tailscale disables newly advertised subnet routes by default, as a safety
measure. Go to the [admin console](https://login.tailscale.com/admin/machines),
find the `telkom-bridge` node, open its route settings, and enable the
`10.252.252.57/32` route.

### Step 5 — Join from your other devices

Install the Tailscale client on your laptop, phone, or any other device you
want to browse from, and sign into the **same Tailscale account/tailnet** as
the bridge. Once connected, those devices can now route to `10.252.252.57`
through the Pi — from home WiFi, mobile data, anywhere.

Sanity check from a remote device:

```bash
tailscale ping telkom-bridge
curl -k https://10.252.252.57
```

### Step 6 — Make the hostname resolve correctly

The server serves multiple sites by name (vhosting), so hitting the bare IP
directly may not return the right site, and the TLS certificate is issued for
the hostname, not the IP. Two ways to fix this:

**Quick — hosts file entry** on each client device:

```
10.252.252.57  seelabs.telkomuniversity.ac.id
```

- Windows: `C:\Windows\System32\drivers\etc\hosts` (edit as Administrator)
- macOS/Linux: `/etc/hosts` (edit with `sudo`)

**Cleaner — Tailscale Split DNS**, so the real hostname resolves
automatically on every tailnet device without manual edits, and covers other
`*.telkomuniversity.ac.id` subdomains too:

1. Admin console → **DNS** → **Add nameserver**.
2. Set it to `10.254.11.34` (Tel-U's internal DNS server — reachable once the
   Pi's route is approved).
3. Restrict it to the domain `telkomuniversity.ac.id` ("Split DNS").

### Step 7 — Keep the bridge resilient

Campus WiFi/eduroam sessions can drop or need periodic re-auth. Add a
watchdog that checks connectivity and restarts networking automatically, so
the bridge self-heals without needing physical access:

```bash
#!/bin/bash
# /usr/local/bin/tailscale-watchdog.sh
if ! tailscale status >/dev/null 2>&1; then
    systemctl restart tailscaled
fi
if ! ping -c 1 -W 3 10.254.11.34 >/dev/null 2>&1; then
    systemctl restart wpa_supplicant
fi
```

Add it to cron to run every few minutes:

```bash
sudo crontab -e
# add:
*/5 * * * * /usr/local/bin/tailscale-watchdog.sh
```

Make sure the script is executable: `sudo chmod +x /usr/local/bin/tailscale-watchdog.sh`.

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Remote device can't ping the bridge | Tailscale not connected on one side | `tailscale status` on both ends, re-run `tailscale up` |
| Bridge connects but route doesn't work | Route not approved | Check admin console → Machines → route toggle |
| `curl` to the IP returns wrong site / cert error | Vhost/SNI mismatch | Use hosts-file entry or Split DNS (Step 6) |
| Bridge drops off campus WiFi after a while | 802.1X session timeout / re-auth required | Confirm wpa_supplicant survives reboot; watchdog script (Step 7) |
| No DHCP lease on wired port | Port not enabled for that MAC / needs registration | Check with Tel-U IT if lab ports require device registration |

### A note on network policy

Before leaving this running long-term, it's worth a quick check with Tel-U's
IT department that running a personal always-on bridge device on campus
WiFi/LAN for this purpose is fine under their acceptable-use policy — this
setup only grants *you* remote access to a resource you already have
legitimate access to on campus, but it's still worth confirming rather than
assuming.
