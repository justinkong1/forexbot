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

            String prompt = "You are an expert forex trading analyst. Your task is to analyze the provided candlestick data for " + Config.INSTRUMENT + " and decide whether to ENTER a trade.\n\n" + 
                     lesson +
                     "CRITICAL INSTRUCTIONS:\n" +
                     "1. BE EXTREMELY SELECTIVE. Most of the time, the correct decision is 'NO'.\n" +
                     "2. ONLY set the signal to 'YES' if there is an exceptionally clear, high-probability setup.\n" +
                     "3. If the market is ranging, chopping, or ambiguous, you MUST set the signal to 'NO'.\n" +
                     "4. If you select 'YES', you must provide a valid 'BUY' or 'SELL' direction.\n" +
                     "   - If 'BUY', take_profit MUST be HIGHER than current close, and stop_loss MUST be LOWER.\n" +
                     "   - If 'SELL', take_profit MUST be LOWER than current close, and stop_loss MUST be HIGHER.\n" +
                     "5. If you select 'NO', you can set direction, entry_price, take_profit, and stop_loss to 'NONE'.\n\n" +
                     "Here is the data:\n" + marketData + "\n\n" + 
                     "Respond ONLY with a JSON object with the following structure:\n" + 
                     "{\"signal\": \"YES\" or \"NO\", \"direction\": \"BUY\", \"SELL\", or \"NONE\", \"entry_price\": \"price or NONE\", \"take_profit\": \"price or NONE\", \"stop_loss\": \"price or NONE\", \"reason\": \"A brief explanation.\"}";
            
            GenerateContentResponse response = genAiClient.models.generateContent("gemini-2.5-flash", prompt, null);
            System.out.println("   AI analysis received.");
            return response.text();
        }
    }
}