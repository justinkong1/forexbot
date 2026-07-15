import { NextResponse } from "next/server";
import { loadCredentials } from "@/lib/credentials";
import { getInstruments } from "@/lib/oanda";

export async function GET() {
  const { oanda } = await loadCredentials();
  if (!oanda) {
    return NextResponse.json(
      { error: "OANDA not configured" },
      { status: 400 },
    );
  }
  const instruments = await getInstruments(oanda);
  const majors = [
    "EUR_USD",
    "USD_JPY",
    "GBP_USD",
    "USD_CHF",
    "AUD_USD",
    "USD_CAD",
    "NZD_USD",
    "EUR_JPY",
    "GBP_JPY",
    "EUR_GBP",
  ];
  const sorted = instruments
    .map((i) => ({ name: i.name, displayName: i.displayName, pipLocation: i.pipLocation }))
    .sort((a, b) => {
      const ai = majors.indexOf(a.name);
      const bi = majors.indexOf(b.name);
      if (ai === -1 && bi === -1) return a.name.localeCompare(b.name);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  return NextResponse.json({ instruments: sorted });
}
