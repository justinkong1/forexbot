import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/auth";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const response = NextResponse.json({ ok: true });
  const session = await getSessionFromRequest(req, response);
  session.destroy();
  return response;
}
