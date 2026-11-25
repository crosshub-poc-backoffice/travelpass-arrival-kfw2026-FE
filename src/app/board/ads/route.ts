import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { list } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { isAdmin } from "@/lib/admin-auth";
import { AD_MAX_BYTES, isVideoName, type AdFile, type AdList } from "@/lib/show";

/**
 * 추첨 전 광고 파일. 운영 콘솔에 로그인한 사람만 쓴다.
 * 배포판은 Vercel Blob(BLOB_READ_WRITE_TOKEN)에 올린다. 파일은 브라우저에서 Blob 으로 바로 가고, 여기서는 올릴 권한만 내준다.
 * 토큰이 없는 개발 서버에서는 public/ads-local 폴더에 둔다 (git 에 올리지 않는다).
 */
export const dynamic = "force-dynamic";

const HAS_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;
const LOCAL = process.env.NODE_ENV !== "production";
const LOCAL_DIR = path.join(process.cwd(), "public", "ads-local");
const PREFIX = "ads/";
const TYPES = ["image/*", "video/*"];

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const fail = (status: number, error: string) => json({ error }, status);
/** 파일 이름에서 경로·특수문자를 뗀다 */
const safeName = (raw: string) => raw.normalize("NFC").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^[-.]+/, "").slice(-80);

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) return fail(401, "로그인이 필요해요.");
  try {
    if (HAS_BLOB) {
      const { blobs } = await list({ prefix: PREFIX, limit: 100 });
      const items: AdFile[] = blobs
        .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
        .map((b) => ({ url: b.url, name: b.pathname.slice(PREFIX.length), video: isVideoName(b.pathname), size: b.size }));
      return json({ mode: "blob", items } satisfies AdList);
    }
    if (!LOCAL) return json({ mode: "off", items: [] } satisfies AdList);
    const names = await readdir(LOCAL_DIR).catch(() => [] as string[]);
    const items = await Promise.all(names.filter((n) => !n.startsWith(".")).map(async (name) => {
      const st = await stat(path.join(LOCAL_DIR, name));
      return { url: `/ads-local/${encodeURIComponent(name)}`, name, video: isVideoName(name), size: st.size, at: st.mtimeMs };
    }));
    return json({ mode: "local", items: items.sort((a, b) => b.at - a.at).map(({ at: _at, ...f }) => f) } satisfies AdList);
  } catch {
    return fail(503, "광고 파일 목록을 불러오지 못했어요.");
  }
}

/** Vercel Blob 업로드 권한 발급 (브라우저의 upload() 가 부른다). 업로드가 끝났다는 Blob 의 알림도 이 주소로 오는데, 그건 서명으로 확인된다 */
export async function POST(req: NextRequest) {
  if (!HAS_BLOB) return fail(503, "광고 저장소(Vercel Blob)가 연결되지 않았어요.");
  const body = (await req.json()) as HandleUploadBody;
  if (body.type === "blob.generate-client-token" && !(await isAdmin(req))) return fail(401, "로그인이 필요해요.");
  try {
    const res = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(PREFIX)) throw new Error("path");
        return { allowedContentTypes: TYPES, maximumSizeInBytes: AD_MAX_BYTES, addRandomSuffix: true };
      },
      onUploadCompleted: async () => {},
    });
    return json(res);
  } catch (e) {
    return fail(400, (e as Error).message);
  }
}

/** 개발 서버 전용: 파일을 public/ads-local 에 그대로 적는다 */
export async function PUT(req: NextRequest) {
  if (HAS_BLOB || !LOCAL) return fail(404, "not found");
  if (!(await isAdmin(req))) return fail(401, "로그인이 필요해요.");
  const name = safeName(req.nextUrl.searchParams.get("name") ?? "");
  if (!name || !/^(image|video)\//.test(req.headers.get("content-type") ?? "")) return fail(400, "이미지나 영상 파일만 올릴 수 있어요.");
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length > AD_MAX_BYTES) return fail(413, "파일이 너무 커요.");
  await mkdir(LOCAL_DIR, { recursive: true });
  await writeFile(path.join(LOCAL_DIR, name), buf);
  return json({ url: `/ads-local/${encodeURIComponent(name)}`, name, video: isVideoName(name), size: buf.length } satisfies AdFile);
}
