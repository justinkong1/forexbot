import { NextResponse } from "next/server";
import { getSession, verifyLogin } from "@/lib/auth";

export async function POST(req: Request) {
  const body = (await req.json()) as { username?: string; password?: string };
  const username = body.username?.trim() || "";
  const password = body.password || "";

  if (!(await verifyLogin(username, password))) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const session = await getSession();
  session.isLoggedIn = true;
  session.username = username;
  await session.save();

  return NextResponse.json({ ok: true });
}
