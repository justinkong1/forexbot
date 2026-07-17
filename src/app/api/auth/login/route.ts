import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest, verifyLogin } from "@/lib/auth";
import { apiError } from "@/lib/api-error";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      username?: string;
      password?: string;
    };
    const username = body.username?.trim() || "";
    const password = body.password || "";

    if (!(await verifyLogin(username, password))) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    const session = await getSessionFromRequest(req, response);
    session.isLoggedIn = true;
    session.username = username;
    await session.save();

    return response;
  } catch (e) {
    return apiError(e, "Login failed");
  }
}
