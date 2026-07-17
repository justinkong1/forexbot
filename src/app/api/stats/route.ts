import { NextResponse } from "next/server";
import { getOrCreateSettings } from "@/lib/db";
import { getOverallStats, getStrategyStats } from "@/lib/stats";
import { apiError } from "@/lib/api-error";

export async function GET() {
  try {
    const settings = await getOrCreateSettings();
    const [strategies, day, swing, overall] = await Promise.all([
      getStrategyStats({ autoDisableEnabled: settings.autoDisableStrategies }),
      getStrategyStats({
        autoDisableEnabled: settings.autoDisableStrategies,
        style: "day",
      }),
      getStrategyStats({
        autoDisableEnabled: settings.autoDisableStrategies,
        style: "swing",
      }),
      getOverallStats(),
    ]);
    return NextResponse.json({
      strategies,
      day,
      swing,
      overall,
      autoDisableEnabled: settings.autoDisableStrategies,
    });
  } catch (e) {
    return apiError(e, "Failed to load stats");
  }
}
