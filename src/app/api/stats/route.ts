import { NextResponse } from "next/server";
import { getOrCreateSettings } from "@/lib/db";
import { getOverallStats, getStrategyStats } from "@/lib/stats";

export async function GET() {
  const settings = await getOrCreateSettings();
  const [strategies, overall] = await Promise.all([
    getStrategyStats({ autoDisableEnabled: settings.autoDisableStrategies }),
    getOverallStats(),
  ]);
  return NextResponse.json({
    strategies,
    overall,
    autoDisableEnabled: settings.autoDisableStrategies,
  });
}
