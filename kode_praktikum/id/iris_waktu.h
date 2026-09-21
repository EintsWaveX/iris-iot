// iris_waktu.h - jam dinding bersama Central & Peripheral (Modul 1)
//
// Central dan Peripheral HARUS disinkronkan dari PC yang sama (kirim
// "YYYY-MM-DD HH:MM:SS.mmm" ke Serial Monitor, atau jalankan
// scripts/send_time.ps1) agar waktu pada kedua papan dapat dibandingkan.
// Berkas ini harus berada di folder yang sama dengan program yang memakainya.
#pragma once

#include <Arduino.h>
#include <time.h>

static uint64_t irisWaktuSyncEpochMs = 0;      // Milidetik Unix pada saat sinkronisasi.
static unsigned long irisWaktuSyncMillis = 0;  // Nilai millis() pada saat yang sama.

static void syncTimeFromSerial() {
  Serial.println("Menunggu waktu PC (YYYY-MM-DD HH:MM:SS.mmm), maksimal 10 detik...");

  unsigned long waitStart = millis();
  while (millis() - waitStart < 10000UL) {
    if (!Serial.available()) {
      continue;
    }

    String line = Serial.readStringUntil('\n');

    // Dicatat sedini mungkin; inilah titik millis() yang mewakili waktu PC itu.
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

      irisWaktuSyncEpochMs = (uint64_t)mktime(&timeInfo) * 1000ULL + (uint64_t)milli;
      irisWaktuSyncMillis  = arrival;

      Serial.println("Waktu tersinkron dari PC sampai milidetik.");
      return;
    }

    Serial.println("Format tidak dikenali, kirim ulang: YYYY-MM-DD HH:MM:SS.mmm");
  }

  Serial.println("Tidak ada waktu PC diterima, timestamp memakai waktu sejak boot.");
}

// Format HH:MM:SS:MS. Setelah tersinkron ini adalah jam dinding nyata sampai ke
// milidetiknya, sehingga waktu pada kedua Serial Monitor boleh dikurangkan.
static String formatTimestamp(unsigned long ms) {
  char buffer[16];

  if (irisWaktuSyncEpochMs != 0) {
    uint64_t nowMs = irisWaktuSyncEpochMs + (uint64_t)(ms - irisWaktuSyncMillis);
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
