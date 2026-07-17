export type RiskProfile = "safe" | "balanced" | "custom";

/**
 * Concrete Settings values written when a preset is selected.
 * "custom" writes nothing — the user controls every field.
 */
export const RISK_PRESETS: Record<
  Exclude<RiskProfile, "custom">,
  {
    label: string;
    description: string;
    values: {
      sizingMode: "risk_sl";
      riskPercent: number;
      minRiskReward: number;
      strategyMinVotes: number;
      sessionFilterEnabled: boolean;
      htfTrendFilterEnabled: boolean;
      autoDisableStrategies: boolean;
      maxDrawdownPercent: number;
      lossStreakHalt: number;
      haltCooldownMinutes: number;
      maxOpenTrades: number;
    };
  }
> = {
  safe: {
    label: "Safe",
    description:
      "Risks 1% per trade, needs 2 strategies to agree, trades only London/NY hours, and stops after 4 losses in a row or a 10% drawdown.",
    values: {
      sizingMode: "risk_sl",
      riskPercent: 1,
      minRiskReward: 1.5,
      strategyMinVotes: 2,
      sessionFilterEnabled: true,
      htfTrendFilterEnabled: true,
      autoDisableStrategies: true,
      maxDrawdownPercent: 10,
      lossStreakHalt: 4,
      haltCooldownMinutes: 60,
      maxOpenTrades: 1,
    },
  },
  balanced: {
    label: "Balanced",
    description:
      "Risks 2% per trade with the same smart filters, allowing a 15% drawdown and 5 losses in a row before pausing.",
    values: {
      sizingMode: "risk_sl",
      riskPercent: 2,
      minRiskReward: 1.5,
      strategyMinVotes: 2,
      sessionFilterEnabled: true,
      htfTrendFilterEnabled: true,
      autoDisableStrategies: true,
      maxDrawdownPercent: 15,
      lossStreakHalt: 5,
      haltCooldownMinutes: 60,
      maxOpenTrades: 1,
    },
  },
};

export function presetValues(profile: RiskProfile) {
  if (profile === "custom") return null;
  return RISK_PRESETS[profile]?.values ?? null;
}
