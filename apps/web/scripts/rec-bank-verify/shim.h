// A tiny stand-in for the Arduino core so the bank's C++ fragments and sketches
// can be run on a PC (rec-bank-verify.py). Compile-checks against the real
// core are done separately with arduino-cli; this only supplies behaviour.
#pragma once
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <functional>
#include <string>
#include <type_traits>
#include <vector>

using byte = uint8_t;
#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2
#define FALLING 2
#define RISING 1
#define HEX 16
#define IRAM_ATTR

struct SimWorld {
  unsigned long ms = 0;
  int pinmode[64] = {};
  int analog[64] = {};
  int analogCalls = 0;
  int res[64] = {};
  std::vector<int> duty;
  std::vector<int> servo;
  std::function<int(int)> read;
};
inline SimWorld W;

inline unsigned long millis() { return W.ms; }
inline void delay(unsigned long d) { W.ms += d; }
inline void pinMode(int p, int m) { W.pinmode[p] = m; }
inline int digitalRead(int p) { return W.read ? W.read(p) : HIGH; }
inline void digitalWrite(int, int) {}
inline int analogRead(int p) { W.analogCalls++; return W.analog[p]; }
inline void ledcAttach(int p, int, int bits) { W.res[p] = bits; }
inline void ledcWrite(int, int d) { W.duty.push_back(d); }

struct SerialT {
  void begin(long) {}
  template <class T> void println(T v) { print(v); std::puts(""); }
  template <class T> void print(T v) {
    if constexpr (std::is_floating_point_v<T>) std::printf("%.2f", (double)v);
    else if constexpr (std::is_same_v<T, bool>) std::printf("%d", (int)v);
    else if constexpr (std::is_integral_v<T>) std::printf("%ld", (long)v);
    else std::printf("%s", v);
  }
};
inline SerialT Serial;
