import { SessionOptions, getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { compare, hash } from "bcryptjs";

export interface SessionData {
  isLoggedIn: boolean;
  username?: string;
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || "complex_password_at_least_32_characters_long",
  cookieName: "forexbot_session",
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
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
  // Support either plain env password or bcrypt hash in AUTH_PASSWORD_HASH
  const hashEnv = process.env.AUTH_PASSWORD_HASH;
  if (hashEnv) {
    return compare(password, hashEnv);
  }
  return password === expectedPass;
}

export async function hashPassword(password: string) {
  return hash(password, 12);
}
