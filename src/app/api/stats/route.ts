import { NextResponse } from "next/server";
import { getOrCreateSettings } from "@/lib/db";
import { getOverallStats, getStrategyStats } from "@/lib/stats";
import { apiError } from "@/lib/api-error";

export async function GET() {
  try {
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
  } catch (e) {
    return apiError(e, "Failed to load stats");
  }
}
