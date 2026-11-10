export interface JobDeps {
  dir: string;
  root: string;
  sekarang(): number;
  tidur(ms: number): Promise<void>;
  baca(path: string): Promise<string | null>;
  tulis(path: string, text: string): Promise<void>;
  /** Moves the request file away and returns what it held, or null when there was none */
  ambil(from: string, to: string): Promise<string | null>;
  tambahLog(text: string): Promise<void> | void;
  kosongkanLog(): Promise<void> | void;
  git(args: string[]): Promise<{ code: number; out: string }>;
  /** Runs deploy.sh for a commit and returns its exit code */
  deploy(ref: string): Promise<number>;
  sehat(): Promise<{ sha?: string } | null>;
}

export function jalankan(d: JobDeps): Promise<{ ran: boolean; ok?: boolean }>;
export function nyata(dir?: string, root?: string): JobDeps;
