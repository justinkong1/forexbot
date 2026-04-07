package org.example;

import com.google.genai.Client;
import com.google.genai.types.GenerateContentResponse;
import com.google.gson.JsonObject;

public class AiService {

    public String analyzeClosedTrade(String marketData, JsonObject closedTrade) throws Exception {
        try (Client genAiClient = new Client()) {
            String prompt = String.format("You are an expert forex trading analyst. Our previous AI-placed trade just closed.\n" +
                            "Trade Details:\nPlaced By: %s\nDirection: %s\nTake Profit: %s\nStop Loss: %s\nReason for entry: %s\n\n" +
                            "Here are the latest candles:\n%s\n\n" +
                            "Based on the recent price action in the data provided, determine whether this trade likely hit the Take Profit or the Stop Loss. " +
                            "Explain WHY the market moved to hit it, and provide a concise learning point to improve future trades.",
                    closedTrade.get("placed_by").getAsString(), closedTrade.get("direction").getAsString(),
                    closedTrade.get("take_profit").getAsString(), closedTrade.get("stop_loss").getAsString(), 
                    closedTrade.get("reason_for_entry").getAsString(), marketData);

            GenerateContentResponse response = genAiClient.models.generateContent("gemini-2.5-flash", prompt, null);
            return response.text();
        }
    }

    public String getEntryAnalysis(String marketData, JsonObject lastClosedTrade) throws Exception {
        System.out.println("   Sending data to Gemini AI for analysis...");
        try (Client genAiClient = new Client()) {
            String lesson = "";
            if (lastClosedTrade != null && lastClosedTrade.has("post_trade_analysis")) {
                lesson = "LESSON FROM PREVIOUS CLOSED TRADE:\n" + lastClosedTrade.get("post_trade_analysis").getAsString() + "\n\nPlease keep this lesson in mind to improve this next trade.\n\n";
            }

            String prompt = "You are an expert forex trading analyst. Analyze the provided candlestick data for " + Config.INSTRUMENT + " to determine if a high-probability trade setup exists to ENTER a trade.\n\n" + 
                     lesson +
                     "CRITICAL: If you select 'YES', you must provide a valid 'BUY' or 'SELL' direction. \n" +
                     "- If 'BUY', your take_profit MUST be HIGHER than the current close price, and stop_loss MUST be LOWER.\n" +
                     "- If 'SELL', your take_profit MUST be LOWER than the current close price, and stop_loss MUST be HIGHER.\n\n" +
                     "Here is the data:\n" + marketData + "\n\n" + 
                     "Respond ONLY with a JSON object with the following structure:\n" + 
                     "{\"signal\": \"YES\" or \"NO\", \"direction\": \"BUY\" or \"SELL\", \"entry_price\": \"price\", \"take_profit\": \"price\", \"stop_loss\": \"price\", \"reason\": \"A brief explanation.\"}";
            
            GenerateContentResponse response = genAiClient.models.generateContent("gemini-2.5-flash", prompt, null);
            System.out.println("   AI analysis received.");
            return response.text();
        }
    }
}