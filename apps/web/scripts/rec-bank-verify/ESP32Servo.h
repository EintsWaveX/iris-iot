#pragma once
#include "shim.h"
struct Servo {
  void attach(int) {}
  void write(int a) { W.servo.push_back(a); }
};
