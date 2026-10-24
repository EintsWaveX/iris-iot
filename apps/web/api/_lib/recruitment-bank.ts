/**
 * Prompt 09's handler for its S3 actions (EXAM-ENGINE 10.3). Until 09 builds
 * it, every action of its area answers 501 `belum_dibuat`; replace this file.
 * The handler reads `req.query.aksi` to tell its actions apart and checks the
 * caller's rights itself (recruitment-s3.ts only settles who is signed in).
 */
import type { SessionPayload } from "../../src/lib/auth.js";
import type { ApiRequest, ApiResponse } from "./http.js";
import { tolak } from "./recruitment-data.js";

export async function handleBank(_req: ApiRequest, res: ApiResponse, _s: SessionPayload) {
  return tolak(res, "belum_dibuat", 501);
}
