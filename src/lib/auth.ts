import { SessionOptions, getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { compare, hash } from "bcryptjs";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export interface SessionData {
  isLoggedIn: boolean;
  username?: string;
}

function sessionPassword(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;
  // Fallback must stay in sync between middleware (Edge) and route handlers
  return "complex_password_at_least_32_characters_long";
}

/** Build options per-request so env is always current (Edge + Node). */
export function getSessionOptions(): SessionOptions {
  // secure cookies break on http://localhost when NODE_ENV=production (next start)
  const secure =
    process.env.COOKIE_SECURE === "true" ||
    (process.env.COOKIE_SECURE !== "false" &&
      process.env.NODE_ENV === "production" &&
      process.env.VERCEL === "1");

  return {
    password: sessionPassword(),
    cookieName: "forexbot_session",
    cookieOptions: {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    },
  };
}

/** @deprecated use getSessionOptions() — kept for any old imports */
export const sessionOptions = getSessionOptions();

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, getSessionOptions());
}

export async function getSessionFromRequest(
  request: NextRequest,
  response: NextResponse,
) {
  return getIronSession<SessionData>(request, response, getSessionOptions());
}

export async function requireSession() {
  const session = await getSession();
  if (!session.isLoggedIn) {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function verifyLogin(username: string, password: string) {
  const expectedUser = process.env.AUTH_USERNAME || "admin";
  const expectedPass = process.env.AUTH_PASSWORD || "changeme";
  if (username !== expectedUser) return false;
  const hashEnv = process.env.AUTH_PASSWORD_HASH;
  if (hashEnv) {
    return compare(password, hashEnv);
  }
  return password === expectedPass;
}

export async function hashPassword(password: string) {
  return hash(password, 12);
}
