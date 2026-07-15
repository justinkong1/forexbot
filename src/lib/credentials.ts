import { getOrCreateSettings } from "./db";
import { decrypt } from "./crypto";
import type { OandaCredentials, OandaEnv } from "./oanda";

export async function loadCredentials(): Promise<{
  oanda: OandaCredentials | null;
  geminiKey: string | null;
  discordWebhook: string | null;
  settings: Awaited<ReturnType<typeof getOrCreateSettings>>;
}> {
  const settings = await getOrCreateSettings();
  let oanda: OandaCredentials | null = null;
  if (settings.oandaTokenEnc && settings.oandaAccountId) {
    oanda = {
      token: decrypt(settings.oandaTokenEnc),
      accountId: settings.oandaAccountId,
      env: (settings.oandaEnv as OandaEnv) || "practice",
    };
  }
  const geminiKey = settings.geminiKeyEnc
    ? decrypt(settings.geminiKeyEnc)
    : null;
  const discordWebhook = settings.discordWebhookEnc
    ? decrypt(settings.discordWebhookEnc)
    : null;
  return { oanda, geminiKey, discordWebhook, settings };
}
