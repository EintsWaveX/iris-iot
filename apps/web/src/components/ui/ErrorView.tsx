/**
 * One error view for every HTTP code the app can meet (Phase 9, the
 * mockup's g-errors): the code with its icon, a title, the cause and what
 * the reader can do, then the actions. Praktikan get their own wording for
 * 403, 409 and 503, with no internals. Callers pass `why`/`todo` when they
 * know the specifics (who saved first, the file size, the server name) and
 * their own actions; the defaults cover the generic case.
 *
 * Usage:
 *   <ErrorView code={404} lang={lang} actions={<a className="btn btn--primary" ...>} />
 *   <ErrorView code={429} lang={lang} retryIn={58} onRetry={retry} />
 */
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  ArrowClockwiseIcon,
  ArrowsClockwiseIcon,
  ArrowsLeftRightIcon,
  DoorOpenIcon,
  HardDrivesIcon,
  HouseIcon,
  LinkIcon,
  NotePencilIcon,
  SquaresFourIcon,
  UsersFourIcon,
  BugIcon,
  CloudXIcon,
  CompassIcon,
  CopySimpleIcon,
  FileArrowUpIcon,
  HourglassHighIcon,
  LockKeyIcon,
  ProhibitIcon,
  WarningIcon,
  WifiXIcon,
  type IconProps,
} from "@phosphor-icons/react";
import IconButton from "./IconButton";
import { dict, href, type ErrorCode } from "../../lib/app";
import { openSignIn } from "../../lib/signin";
import type { Lang } from "../../lib/kelas";
import "./ErrorView.css";

export type { ErrorCode };

const ICON: Record<ErrorCode, ComponentType<IconProps>> = {
  400: WarningIcon,
  401: LockKeyIcon,
  403: ProhibitIcon,
  404: CompassIcon,
  408: WifiXIcon,
  409: ArrowsClockwiseIcon,
  413: FileArrowUpIcon,
  429: HourglassHighIcon,
  500: BugIcon,
  503: CloudXIcon,
};

interface Copy {
  title: string;
  why: string;
  todo: string;
}

const T = dict({
  id: {
    cause: "Penyebab",
    todo: "Yang Bisa Kamu Lakukan",
    retry: "Coba Lagi",
    retryIn: (n: number) => `Coba Lagi dalam ${n} Detik`,
    retryAuto: (n: number) => `Mencoba lagi otomatis dalam ${n} detik.`,
    errCode: "Kode galat",
    copy: "Salin kode galat",
    copied: "Kode disalin.",
    act: {
      reload: "Muat Ulang",
      home: "Ke Beranda",
      signIn: "Masuk",
      dash: "Ke Dasbor",
      admins: "Lihat Admin di Tim",
      console: "Ke Konsol",
      report: "Laporkan",
      server: "Lihat Status Server",
      compare: "Bandingkan",
      link: "Pakai Tautan",
      otherFile: "Pilih Berkas Lain",
    },
    codes: {
      400: {
        title: "Permintaan Tidak Dikenali",
        why: "Data yang dikirim halaman ini tidak lengkap atau rusak. Biasanya karena halaman sudah lama terbuka.",
        todo: "Muat ulang halaman, lalu coba sekali lagi.",
      },
      401: {
        title: "Kamu Sudah Keluar",
        why: "Sesi masukmu berakhir, misalnya karena sudah lama atau karena keluar di perangkat lain.",
        todo: "Masuk lagi. Pekerjaanmu yang sudah tersimpan tetap ada.",
      },
      403: {
        title: "Halaman Ini Bukan untuk Peranmu",
        why: "Bagian ini butuh peran lain dari peran yang kamu pakai sekarang.",
        todo: "Minta Admin memberimu akses, atau minta Pengelola melakukannya untukmu.",
      },
      404: {
        title: "Halaman Tidak Ditemukan",
        why: "Alamat ini tidak ada. Mungkin salah ketik, atau tautannya sudah lama.",
        todo: "Kembali ke Beranda atau pakai menu di atas.",
      },
      408: {
        title: "Koneksi Terputus",
        why: "Server tidak menjawab tepat waktu. Wi-Fi lab mungkin sedang ramai, atau perangkatmu lepas dari jaringan.",
        todo: "Halaman mencoba lagi sendiri. Isianmu disimpan di perangkat ini sampai terkirim.",
      },
      409: {
        title: "Ada yang Menyimpan Lebih Dulu",
        why: "Orang lain mengubah data ini setelah kamu membukanya.",
        todo: "Muat ulang untuk melihat versi terbaru, lalu ulangi perubahanmu. Tidak ada yang hilang.",
      },
      413: {
        title: "Berkas Terlalu Besar",
        why: "Berkas yang kamu pilih melebihi batas ukuran.",
        todo: "Kecilkan berkasnya, atau pakai tautan sebagai gantinya.",
      },
      429: {
        title: "Terlalu Banyak Percobaan",
        why: "Ada terlalu banyak percobaan dalam waktu singkat, jadi dikunci sebentar.",
        todo: "Tunggu hitung mundur selesai, lalu coba lagi.",
      },
      500: {
        title: "Ada yang Rusak di Server",
        why: "Server gagal menyelesaikan permintaan ini. Ini bukan salahmu.",
        todo: "Coba lagi. Kalau terulang, laporkan dengan kode galat di bawah.",
      },
      503: {
        title: "Server Lab Sedang Tidak Tersedia",
        why: "Orange Pi lab tidak mengirim denyut, atau sedang diperbarui.",
        todo: "Data Live berhenti sementara. Halaman lain tetap jalan.",
      },
    } as Record<ErrorCode, Copy>,
    praktikan: {
      403: {
        title: "Halaman Ini untuk Asisten",
        why: "Bagian ini hanya untuk asisten praktikum.",
        todo: "Kembali ke Dasbor untuk melanjutkan praktikummu.",
      },
      409: {
        why: "Anggota kelompokmu mengisi blank yang sama lebih dulu.",
        todo: "Muat ulang untuk melihat isiannya.",
      },
      503: {
        why: "Server lab sedang tidak menjawab.",
        todo: "Data Live berhenti sementara. Kode dan isianmu tetap tersimpan. Beri tahu asistenmu.",
      },
    } as Partial<Record<ErrorCode, Partial<Copy>>>,
  },
  en: {
    cause: "Cause",
    todo: "What You Can Do",
    retry: "Try Again",
    retryIn: (n: number) => `Try Again in ${n} Seconds`,
    retryAuto: (n: number) => `Retrying on its own in ${n} seconds.`,
    errCode: "Error code",
    copy: "Copy the error code",
    copied: "Code copied.",
    act: {
      reload: "Reload",
      home: "Go Home",
      signIn: "Sign In",
      dash: "Go to Dashboard",
      admins: "See Admins on Team",
      console: "Go to Console",
      report: "Report It",
      server: "See Server Status",
      compare: "Compare",
      link: "Use a Link",
      otherFile: "Choose Another File",
    },
    codes: {
      400: {
        title: "Request Not Understood",
        why: "The data this page sent was incomplete or broken. Usually the page has been open for a long time.",
        todo: "Reload the page, then try once more.",
      },
      401: {
        title: "You Are Signed Out",
        why: "Your sign-in ended, for example because it was a while ago or you signed out on another device.",
        todo: "Sign in again. Work that was saved is still there.",
      },
      403: {
        title: "This Page Isn't for Your Role",
        why: "This part needs a different role from the one you are using now.",
        todo: "Ask an Admin to grant you access, or ask a Manager to make the change for you.",
      },
      404: {
        title: "Page Not Found",
        why: "This address doesn't exist. It may be a typo, or an old link.",
        todo: "Go back Home or use the menu above.",
      },
      408: {
        title: "Connection Lost",
        why: "The server didn't answer in time. The lab Wi-Fi may be busy, or your device dropped off the network.",
        todo: "The page retries on its own. What you typed is kept on this device until it is sent.",
      },
      409: {
        title: "Someone Saved First",
        why: "Someone else changed this after you opened it.",
        todo: "Reload to see the newest version, then make your change again. Nothing is lost.",
      },
      413: {
        title: "File Too Large",
        why: "The file you chose is over the size limit.",
        todo: "Shrink the file, or use a link instead.",
      },
      429: {
        title: "Too Many Attempts",
        why: "There were too many attempts in a short time, so it is locked for a moment.",
        todo: "Wait for the countdown, then try again.",
      },
      500: {
        title: "Something Broke on the Server",
        why: "The server failed to finish this request. It's not your fault.",
        todo: "Try again. If it happens again, report it with the error code below.",
      },
      503: {
        title: "The Lab Server Is Unavailable",
        why: "The lab's Orange Pi isn't sending heartbeats, or it is being updated.",
        todo: "Live data is paused. The rest of the site keeps working.",
      },
    } as Record<ErrorCode, Copy>,
    praktikan: {
      403: {
        title: "This Page Is for Assistants",
        why: "This part is only for lab assistants.",
        todo: "Go back to your Dashboard to carry on.",
      },
      409: {
        why: "A groupmate filled the same blank first.",
        todo: "Reload to see their answer.",
      },
      503: {
        why: "The lab server isn't answering right now.",
        todo: "Live data is paused. Your code and answers are still saved. Tell your assistant.",
      },
    } as Partial<Record<ErrorCode, Partial<Copy>>>,
  },
  zh: {
    cause: "原因",
    todo: "你可以做什么",
    retry: "再试一次",
    retryIn: (n: number) => `${n} 秒后再试`,
    retryAuto: (n: number) => `${n} 秒后自动重试。`,
    errCode: "错误代码",
    copy: "复制错误代码",
    copied: "代码已复制。",
    act: {
      reload: "重新加载",
      home: "回到首页",
      signIn: "登录",
      dash: "前往面板",
      admins: "在团队页查看管理员",
      console: "前往控制台",
      report: "报告问题",
      server: "查看服务器状态",
      compare: "对比",
      link: "改用链接",
      otherFile: "选择其他文件",
    },
    codes: {
      400: {
        title: "看不懂这个请求",
        why: "这个页面发来的数据不完整或坏掉了。通常是页面开太久了。",
        todo: "重新加载页面，再试一次。",
      },
      401: {
        title: "你已经退出登录",
        why: "你的登录已经结束，比如时间太久，或者你在别的设备上退出了。",
        todo: "重新登录就行。已保存的内容都还在。",
      },
      403: {
        title: "这个页面不是给你的角色用的",
        why: "这一部分需要和你现在不同的角色。",
        todo: "请管理员给你权限，或者请主管帮你修改。",
      },
      404: {
        title: "找不到页面",
        why: "这个地址不存在。可能打错了，或者是旧链接。",
        todo: "回首页，或者用上面的菜单。",
      },
      408: {
        title: "连接断了",
        why: "服务器没有及时回应。实验室 Wi-Fi 可能很忙，或者你的设备掉线了。",
        todo: "页面会自己重试。你输入的内容会先存在这台设备上，直到发出去。",
      },
      409: {
        title: "有人先保存了",
        why: "你打开之后，别人改过这里。",
        todo: "重新加载看看最新版本，再改一次。什么都不会丢。",
      },
      413: {
        title: "文件太大",
        why: "你选的文件超过了大小限制。",
        todo: "把文件变小，或者改用链接。",
      },
      429: {
        title: "尝试次数太多",
        why: "短时间内尝试太多次，所以暂时锁住了。",
        todo: "等倒计时结束再试。",
      },
      500: {
        title: "服务器出问题了",
        why: "服务器没能完成这个请求。不是你的错。",
        todo: "再试一次。如果又出现，请带上下面的错误代码报告。",
      },
      503: {
        title: "实验室服务器暂时不可用",
        why: "实验室的 Orange Pi 没有发心跳，或者正在更新。",
        todo: "实时数据暂停了。网站其他部分照常运行。",
      },
    } as Record<ErrorCode, Copy>,
    praktikan: {
      403: {
        title: "这个页面是给助教用的",
        why: "这一部分只给实验室助教用。",
        todo: "回到你的仪表盘继续。",
      },
      409: {
        why: "组员先填了同一个 blank。",
        todo: "重新加载看看他们的答案。",
      },
      503: {
        why: "实验室服务器现在没有回应。",
        todo: "实时数据暂停了。你的代码和答案都还保存着。告诉你的助教。",
      },
    } as Partial<Record<ErrorCode, Partial<Copy>>>,
  },
});

interface Props {
  code: ErrorCode;
  lang: Lang;
  /** Praktikan get their own wording for 403, 409 and 503. */
  role?: "asisten" | "praktikan" | null;
  why?: string;
  todo?: string;
  actions?: ReactNode;
  /** Shows a Try Again button; with `retryIn` it counts down first. */
  onRetry?: () => void;
  retryIn?: number;
  /** 500: the code to quote in a report. */
  errorCode?: string;
  /** 409: open the two versions side by side. */
  onCompare?: () => void;
  /** 413: switch the upload to a link, or pick another file. */
  onUseLink?: () => void;
  onPickFile?: () => void;
}

function Btn({
  primary,
  ghost,
  icon: Icon,
  onClick,
  children,
}: {
  primary?: boolean;
  ghost?: boolean;
  icon?: ComponentType<IconProps>;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={"btn" + (primary ? " btn--primary" : ghost ? " btn--ghost" : "")}
      onClick={onClick}
    >
      {Icon && <Icon size={20} aria-hidden="true" />}
      {children}
    </button>
  );
}

export default function ErrorView({
  code,
  lang,
  role,
  why,
  todo,
  actions,
  onRetry,
  retryIn,
  errorCode,
  onCompare,
  onUseLink,
  onPickFile,
}: Props) {
  const t = T[lang];
  const copy: Copy = {
    ...t.codes[code],
    ...(role === "praktikan" ? (t.praktikan[code] ?? {}) : {}),
  };
  const [left, setLeft] = useState(retryIn ?? 0);
  useEffect(() => setLeft(retryIn ?? 0), [retryIn]);
  useEffect(() => {
    if (left <= 0) return;
    const id = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(id);
  }, [left]);
  // 408 retries on its own when the countdown ends.
  useEffect(() => {
    if (code === 408 && retryIn && left === 0 && onRetry) onRetry();
  }, [code, retryIn, left, onRetry]);

  // The mockup's actions for each code, when the caller brings none, so no
  // error ends in a dead end.
  const a = t.act;
  const go = (path: string) => () => location.assign(href(lang, path));
  const reload = () => location.reload();
  const prak = role === "praktikan";
  const fallback: ReactNode = actions
    ? null
    : {
        400: (
          <>
            <Btn primary icon={ArrowClockwiseIcon} onClick={reload}>
              {a.reload}
            </Btn>
            <Btn icon={HouseIcon} ghost onClick={go("/")}>
              {a.home}
            </Btn>
          </>
        ),
        401: (
          <Btn primary icon={DoorOpenIcon} onClick={() => openSignIn()}>
            {a.signIn}
          </Btn>
        ),
        403: prak ? (
          <Btn primary icon={SquaresFourIcon} onClick={go("/dashboard")}>
            {a.dash}
          </Btn>
        ) : (
          <>
            <Btn primary icon={UsersFourIcon} onClick={go("/team")}>
              {a.admins}
            </Btn>
            <Btn ghost onClick={go("/session")}>
              {a.console}
            </Btn>
          </>
        ),
        404: (
          <Btn primary icon={HouseIcon} onClick={go("/")}>
            {a.home}
          </Btn>
        ),
        408: onRetry ? null : (
          <Btn primary icon={ArrowClockwiseIcon} onClick={reload}>
            {a.reload}
          </Btn>
        ),
        409: (
          <>
            {onCompare && (
              <Btn primary icon={ArrowsLeftRightIcon} onClick={onCompare}>
                {a.compare}
              </Btn>
            )}
            <Btn primary={!onCompare} icon={ArrowClockwiseIcon} onClick={onRetry ?? reload}>
              {a.reload}
            </Btn>
          </>
        ),
        413: (
          <>
            {onUseLink && (
              <Btn primary icon={LinkIcon} onClick={onUseLink}>
                {a.link}
              </Btn>
            )}
            {onPickFile && (
              <Btn ghost={!!onUseLink} primary={!onUseLink} onClick={onPickFile}>
                {a.otherFile}
              </Btn>
            )}
          </>
        ),
        429: null,
        500: prak ? null : (
          <Btn icon={NotePencilIcon} onClick={go("/reports?dokumen&baru=1")}>
            {a.report}
          </Btn>
        ),
        503: prak ? (
          <Btn primary icon={SquaresFourIcon} onClick={go("/dashboard")}>
            {a.dash}
          </Btn>
        ) : (
          <Btn primary icon={HardDrivesIcon} onClick={go("/servers")}>
            {a.server}
          </Btn>
        ),
      }[code];

  const tone =
    code >= 500 ? "danger" : code === 408 || code === 409 || code === 429 ? "warn" : "accent";
  const Icon = ICON[code];
  return (
    <section className="panel panel--raised errview" data-tone={tone}>
      <div className="errview__code">
        <span className="errview__ic" aria-hidden="true">
          <Icon size={30} />
        </span>
        <span className="mono">{code}</span>
      </div>
      <h1 className="errview__title">{copy.title}</h1>
      <div className="errview__why">
        <span className="errview__k">{t.cause}</span>
        <p>{why ?? copy.why}</p>
      </div>
      <div className="errview__why">
        <span className="errview__k">{t.todo}</span>
        <p>{todo ?? copy.todo}</p>
      </div>
      {code === 500 && errorCode && (
        <div className="row">
          <span className="hint">{t.errCode}</span>
          <code className="ctl-kbd">{errorCode}</code>
          <IconButton
            icon={CopySimpleIcon}
            label={t.copy}
            sm
            onClick={() => {
              void navigator.clipboard?.writeText(errorCode);
              window.Toast?.show(t.copied, "ok");
            }}
          />
        </div>
      )}
      {code === 408 && retryIn && left > 0 && <span className="hint">{t.retryAuto(left)}</span>}
      {(onRetry || actions || fallback) && (
        <div className="row">
          {/* 409's own Muat Ulang already runs onRetry. */}
          {onRetry && code !== 409 && (
            <button
              type="button"
              className="btn btn--primary"
              disabled={left > 0 && code === 429}
              onClick={() => {
                setLeft(code === 408 ? (retryIn ?? 0) : 0);
                onRetry();
              }}
            >
              <ArrowClockwiseIcon size={20} aria-hidden="true" />
              {left > 0 && code === 429 ? t.retryIn(left) : t.retry}
            </button>
          )}
          {actions ?? fallback}
        </div>
      )}
    </section>
  );
}
