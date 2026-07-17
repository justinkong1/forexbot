import { NextResponse } from "next/server";

export function apiError(e: unknown, fallback = "Request failed", status = 500) {
  const message = e instanceof Error ? e.message : fallback;
  return NextResponse.json({ error: message }, { status });
}
