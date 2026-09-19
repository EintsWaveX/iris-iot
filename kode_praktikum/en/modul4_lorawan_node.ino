/*
 * MODULE 4 - LONG RANGE COMMUNICATION (LoRaWAN)  |  Role: NODE / END DEVICE
 * Board   : Cosmic LoRa Aurora V2 (ESP32 + RFM95W)
 * Library : MCCI LoRaWAN LMIC library
 *
 * The node measures distance with an HC-SR04 and sends it to the WM1302
 * gateway over LoRaWAN. In Part A a collision was impossible because only one
 * out here: the gateway listens on eight channels at once, so packets from
 * different groups never have to queue.
 *
 * Fill in every blank; the numbers (1) through (6) in the comment beside each
 * one are the hints.
 */

#include <________>  // (1) Main header of the MCCI LoRaWAN LMIC library
#include <hal/hal.h>
#include <SPI.h>
#include <time.h>

// ---- GROUP NUMBER ----------------------------------------------------------
// Remove the // from ONE line only: the line with your group number. It
// becomes the last DEVEUI byte and the first payload byte.
#define GROUP_ID 1
// #define GROUP_ID 2
// #define GROUP_ID 3
// #define GROUP_ID 4
// #define GROUP_ID 5
// #define GROUP_ID 6
// #define GROUP_ID 7
// #define GROUP_ID 8

// RFM95W radio pins on the Cosmic LoRa Aurora V2 board. Unlike Part A,
// LoRaWAN also uses DIO1 to mark the receive windows.
#define LORA_NSS  15
#define LORA_RST  0
#define LORA_DIO0 27
#define LORA_DIO1 2
#define LORA_EN   32

#define SPI_MISO 19
#define SPI_MOSI 23
#define SPI_SCK  18

// The HC-SR04 sits on GPIO16 (TRIG) and GPIO17 (ECHO), with its 1 kOhm/2 kOhm
// including the 1 kOhm/2 kOhm voltage divider on the ECHO line.
const int TRIG_PIN = 16;
const int ECHO_PIN = 17;

const float SOUND_CM_PER_US = 0.0343;
const unsigned long ECHO_TIMEOUT_US = 25000;

// A 30-second gap keeps the duty cycle polite; LoRaWAN needs no transmit
// scheduling between nodes is the protocol's job, not yours.
const unsigned TX_INTERVAL_S = 30;

// The LoRaWAN application port; 1 is enough for this practicum.
const u1_t APP_PORT = 1;

// OTAA keys. DEVEUI is made unique by the group number so every board is
// registered separately in ChirpStack. APPKEY is copied from the device
// page in ChirpStack, written in MSB order.
static const u1_t PROGMEM APPEUI[8]  = { 0, 0, 0, 0, 0, 0, 0, 0 };
static const u1_t PROGMEM DEVEUI[8]  = { GROUP_ID, 0x00, 0x00, 0x00, 0x00, 0x00, 0x53, 0x49 };
static const u1_t PROGMEM APPKEY[16] = { ________ };  // (2) The sixteen APPKEY bytes from ChirpStack

void os_getArtEui(u1_t *buf) { memcpy_P(buf, APPEUI, 8); }
void os_getDevEui(u1_t *buf) { memcpy_P(buf, DEVEUI, 8); }
void os_getDevKey(u1_t *buf) { memcpy_P(buf, APPKEY, 16); }

// The pin map LMIC uses to talk to the radio.
const lmic_pinmap lmic_pins = {
  .nss  = LORA_NSS,
  .rxtx = LMIC_UNUSED_PIN,
  .rst  = LORA_RST,
  .dio  = { LORA_DIO0, ________, LMIC_UNUSED_PIN },  // (3) DIO1 pin constant
};

static osjob_t sendjob;

// Wall clock from the PC over Serial. The node and the
// Orange Pi must share one clock for their times to be subtractable.
uint64_t syncEpochMs = 0;
unsigned long syncMillis = 0;

void syncTimeFromSerial() {
  Serial.println("Waiting for the PC time (YYYY-MM-DD HH:MM:SS.mmm), up to 10 seconds...");

  unsigned long waitStart = millis();
  while (millis() - waitStart < 10000UL) {
    if (!Serial.available()) {
      continue;
    }

    String line = Serial.readStringUntil('\n');
    unsigned long arrival = millis();
    line.trim();

    struct tm timeInfo = {};
    int year, month, day, hour, minute, second, milli = 0;

    if (sscanf(line.c_str(), "%d-%d-%d %d:%d:%d.%d",
               &year, &month, &day, &hour, &minute, &second, &milli) >= 6) {
      timeInfo.tm_year = year - 1900;
      timeInfo.tm_mon  = month - 1;
      timeInfo.tm_mday = day;
      timeInfo.tm_hour = hour;
      timeInfo.tm_min  = minute;
      timeInfo.tm_sec  = second;

      syncEpochMs = (uint64_t)mktime(&timeInfo) * 1000ULL + (uint64_t)milli;
      syncMillis  = arrival;

      Serial.println("Time synchronised from the PC down to the millisecond.");
      return;
    }

    Serial.println("Format not recognised, send again as: YYYY-MM-DD HH:MM:SS.mmm");
  }

  Serial.println("No PC time received, timestamps fall back to time since boot.");
}

// Format HH:MM:SS:MS, the same one the gateway monitor prints.
String formatTimestamp(unsigned long ms) {
  char buffer[16];

  if (syncEpochMs != 0) {
    uint64_t nowMs = syncEpochMs + (uint64_t)(ms - syncMillis);
    time_t seconds = (time_t)(nowMs / 1000ULL);
    struct tm *t = localtime(&seconds);

    snprintf(buffer, sizeof(buffer), "%02d:%02d:%02d:%03u",
             t->tm_hour, t->tm_min, t->tm_sec, (unsigned)(nowMs % 1000ULL));
    return String(buffer);
  }

  unsigned long totalSeconds = ms / 1000UL;
  snprintf(buffer, sizeof(buffer), "%02lu:%02lu:%02lu:%03lu",
           (totalSeconds / 3600UL) % 24UL, (totalSeconds / 60UL) % 60UL,
           totalSeconds % 60UL, ms % 1000UL);
  return String(buffer);
}

// Measures the distance in centimetres; -1 when no echo comes back.
int readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  unsigned long duration = ________(ECHO_PIN, HIGH, ECHO_TIMEOUT_US);  // (4) Pulse-width measuring function

  if (duration == 0) {
    return -1;
  }

  return (int)((duration * SOUND_CM_PER_US) / 2.0);
}

void do_send(osjob_t *j) {
  if (LMIC.opmode & OP_TXRXPEND) {
    Serial.println("The previous transmission has not finished, packet skipped.");
    return;
  }

  int distance = readDistanceCm();

  if (distance < 0) {
    Serial.printf("[%s] HC-SR04 received no echo, packet skipped.\n",
                  formatTimestamp(millis()).c_str());
  } else {
    // Three bytes: the group number, then the distance as a 16-bit value. A
    // LoRaWAN payload is kept short because air time is expensive.
    uint8_t payload[3];
    payload[0] = GROUP_ID;
    payload[1] = (uint8_t)(distance >> 8);
    payload[2] = (uint8_t)(distance & 0xFF);

    ________(APP_PORT, payload, sizeof(payload), 0);  // (5) LMIC function that schedules a data transmission

    Serial.printf("[%s] Group %d sent a distance of %d cm to the gateway.\n",
                  formatTimestamp(millis()).c_str(), GROUP_ID, distance);
  }

  os_setTimedCallback(&sendjob, os_getTime() + sec2osticks(TX_INTERVAL_S), do_send);
}

void onEvent(ev_t ev) {
  switch (ev) {
    case EV_JOINING:
      Serial.println("Requesting to join (OTAA) the LoRaWAN network...");
      break;
    case EV_JOINED:
      Serial.println("Joined the LoRaWAN network.");
      // Link check is disabled so a quiet network does not look like a dropout.
      LMIC_setLinkCheckMode(0);
      break;
    case EV_JOIN_FAILED:
      Serial.println("Join failed; check DEVEUI and APPKEY in ChirpStack.");
      break;
    case EV_TXCOMPLETE:
      Serial.printf("[%s] Packet finished transmitting.\n", formatTimestamp(millis()).c_str());
      break;
    default:
      break;
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  syncTimeFromSerial();

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);

  pinMode(LORA_EN, OUTPUT);
  digitalWrite(LORA_EN, HIGH);
  delay(100);

  SPI.begin(SPI_SCK, SPI_MISO, SPI_MOSI, LORA_NSS);

  os_init();
  LMIC_reset();

  // The AS923 band is selected through the LMIC library configuration; SF7
  // keeps the air time short, just as the Part A beacon does.
  LMIC_setDrTxpow(DR_SF7, 14);

  do_send(&sendjob);
}

void loop() {
  // All LoRaWAN scheduling is done by this function.
  ________();  // (6) Main function that runs the LMIC queue
}
