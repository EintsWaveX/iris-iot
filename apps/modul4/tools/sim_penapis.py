"""Tuning bench for the PC-side RSSI filter (server.py PenapisRssi; the CI check is uji_penapis.py): compares the Hunter's own
median-of-5 + EWMA 0.25 with candidate PC filters on a noisy step, a noisy plateau and a one packet spike.

    python tools/sim_penapis.py
"""
import random
import statistics


def old_filter(zs, n=5, alpha=0.25):
    win, x, out = [], None, []
    for z in zs:
        win = (win + [z])[-n:]
        m = sorted(win)[len(win) // 2]
        x = m if x is None else alpha * m + (1 - alpha) * x
        out.append(x)
    return out


class New:
    LANTAI, LANGIT, SKALA, LONCAT = 0.3, 0.85, 0.1, 8.0

    def __init__(self):
        self.x = None
        self.win = []
        self.arah = 0
        self.n = 0

    def add(self, z):
        self.win = (self.win + [z])[-3:]
        m = sorted(self.win)[len(self.win) // 2]
        if self.x is None:
            self.x = float(m)
            return self.x
        inov = m - self.x
        if abs(inov) >= self.LONCAT:
            a = 1 if inov > 0 else -1
            self.n = self.n + 1 if a == self.arah else 1
            self.arah = a
            if self.n >= 2:
                self.x, self.n = float(m), 0
                return self.x
        else:
            self.n, self.arah = 0, 0
        g = min(self.LANGIT, max(self.LANTAI, self.LANTAI + self.SKALA * (abs(inov) - 2)))
        self.x += g * inov
        return self.x


def run(f, zs):
    return f(zs) if callable(f) and not isinstance(f, type) else None


def new_filter(zs):
    p = New()
    return [p.add(z) for z in zs]


def packets_to(out, start, target, tol):
    for i in range(start, len(out)):
        if abs(out[i] - target) <= tol:
            return i - start
    return None


random.seed(7)
for sigma in (2.0, 4.0):
    zs = [-80 + random.gauss(0, sigma) for _ in range(40)] + [-60 + random.gauss(0, sigma) for _ in range(40)]
    o, n = old_filter(zs), new_filter(zs)
    plateau_old = statistics.pstdev(o[10:40])
    plateau_new = statistics.pstdev(n[10:40])
    print(f"sigma {sigma}: plateau std old {plateau_old:.2f} new {plateau_new:.2f}; "
          f"packets to within 3 dB of the step: old {packets_to(o, 40, -60, 3)} new {packets_to(n, 40, -60, 3)}")

zs = [-70.0] * 20 + [-55.0] + [-70.0] * 10
print("single spike +15 dB: peak shift old", round(max(old_filter(zs)) + 70, 2), "new", round(max(new_filter(zs)) + 70, 2))
zs = [-70.0] * 20 + [-55.0, -55.0] + [-70.0] * 10
print("two packet spike +15 dB: peak shift old", round(max(old_filter(zs)) + 70, 2), "new", round(max(new_filter(zs)) + 70, 2))
