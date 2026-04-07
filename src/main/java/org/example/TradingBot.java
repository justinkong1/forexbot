package org.example;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class TradingBot {

    private static final OandaService oanda = new OandaService();
    private static final AiService ai = new AiService();
    private static final DiscordService discord = new DiscordService();

    public static void main(String[] args) {
        try (ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor()) {
            System.out.println("🤖 Trading Bot Activated. Analysis will run every 60 minutes.");
            scheduler.scheduleAtFixedRate(TradingBot::runTradingLogic, 0, 60, TimeUnit.MINUTES);
            
            // Keep main thread alive
            while (true) {
                Thread.sleep(100000);
            }
        } catch (InterruptedException e) {
            System.err.println("Bot interrupted.");
        }
    }

    private static void runTradingLogic() {
        System.out.println("\n[" + java.time.LocalTime.now() + "] Running analysis...");
        try {
            // --- 1. FETCH ACCOUNT SUMMARY & POSITIONS ---
            JsonObject accountSummary = oanda.getAccountSummary();
            double marginAvailable = accountSummary.get("marginAvailable").getAsDouble();
            double balance = accountSummary.get("balance").getAsDouble();
            
            JsonObject openPosition = oanda.checkOpenPositions();
            boolean currentlyInTrade = openPosition != null;

            // Load local trade history
            JsonArray tradeHistory = loadTradeHistory();
            JsonObject lastTrade = !tradeHistory.isEmpty() ? tradeHistory.get(tradeHistory.size() - 1).getAsJsonObject() : null;

            // Prepare account info string for Discord
            StringBuilder accountInfo = new StringBuilder();
            accountInfo.append("💰 **Account Status:**\n");
            accountInfo.append("- Balance: $").append(String.format("%.2f", balance)).append("\n");
            accountInfo.append("- Available Margin: $").append(String.format("%.2f", marginAvailable)).append("\n");
            
            String aiAnalysisJson;

            // --- 2. HANDLE CLOSED TRADE POST-ANALYSIS ---
            if (!currentlyInTrade && lastTrade != null && "OPEN".equals(lastTrade.get("status").getAsString())) {
                System.out.println("   Detecting recently closed trade. Analyzing outcome...");
                String marketData = oanda.fetchMarketData();
                String analysis = ai.analyzeClosedTrade(marketData, lastTrade);
                
                lastTrade.addProperty("status", "CLOSED");
                lastTrade.addProperty("post_trade_analysis", analysis);
                saveTradeHistory(tradeHistory);
                
                discord.sendMessage("📊 **Post-Trade Analysis Completed:**\n" + analysis);
            }

            // --- 3. HANDLE CURRENT TRADE STATUS ---
            if (currentlyInTrade) {
                int longUnits = openPosition.getAsJsonObject("long").get("units").getAsInt();
                int shortUnits = openPosition.getAsJsonObject("short").get("units").getAsInt();
                double pl = openPosition.get("unrealizedPL").getAsDouble();
                accountInfo.append("\n📈 **Current Open Trade (").append(Config.INSTRUMENT).append("):**\n");
                accountInfo.append("- Long Units: ").append(longUnits).append("\n");
                accountInfo.append("- Short Units: ").append(shortUnits).append("\n");
                accountInfo.append("- Unrealized P/L: $").append(String.format("%.2f", pl)).append(pl >= 0 ? " 🟢" : " 🔴").append("\n");
                
                System.out.println("   Currently in a trade. Skipping AI entry analysis and letting OANDA handle TP/SL.");
                aiAnalysisJson = "{\n  \"signal\": \"HOLD\",\n  \"reason\": \"Currently in an active trade. Letting OANDA handle the Take Profit or Stop Loss.\"\n}";
                
                String finalDiscordMessage = accountInfo.toString() + "\n🤖 **AI Analysis & Decision:**\n```json\n" + aiAnalysisJson + "\n```";
                discord.sendMessage(finalDiscordMessage);
                
            } else {
                accountInfo.append("\n📉 **No Open Trades.**\n");

                // --- 4. FETCH MARKET DATA FOR NEW TRADE ---
                String marketData = oanda.fetchMarketData();
                
                // Calculate trade size
                double instrumentMarginRate = oanda.getInstrumentMarginRate(Config.INSTRUMENT);
                double maxUnits = marginAvailable / instrumentMarginRate;
                int tradeUnits = (int) (maxUnits * Config.RISK_PERCENTAGE);
                
                System.out.printf("   Calculation: Margin: %.2f / Instrument Rate: %.2f = Max Units: %.2f%n", marginAvailable, instrumentMarginRate, maxUnits);
                System.out.printf("   Applying %.2f%% risk. Units to trade: %d%n", Config.RISK_PERCENTAGE * 100, tradeUnits);

                // --- 5. GET AI DECISION ---
                aiAnalysisJson = ai.getEntryAnalysis(marketData, lastTrade);

                // --- 6. EXECUTE TRADE LOGIC ---
                executeTradeDecision(aiAnalysisJson, tradeUnits, tradeHistory);

                // --- 7. SEND RESULT TO DISCORD ---
                String cleanJsonForDiscord = aiAnalysisJson.replace("```json", "").replace("```", "").trim();
                String finalDiscordMessage = accountInfo.toString() + "\n🤖 **AI Analysis & Decision:**\n```json\n" + cleanJsonForDiscord + "\n```";
                discord.sendMessage(finalDiscordMessage);
            }

        } catch (Exception e) {
            String errorMessage = "❌ An error occurred: " + e.getMessage();
            System.err.println(errorMessage);
            try {
                discord.sendMessage(errorMessage);
            } catch (Exception discordError) {
                System.err.println("❌ Failed to send error message to Discord: " + discordError.getMessage());
            }
        }
    }

    private static void executeTradeDecision(String analysisJsonString, int unitsToTrade, JsonArray tradeHistory) {
        try {
            String cleanJson = analysisJsonString.replace("`", "").replace("json", "").trim();
            JsonObject decision = JsonParser.parseString(cleanJson).getAsJsonObject();
            String signal = decision.get("signal").getAsString().toUpperCase();

            if (signal.equals("YES")) {
                System.out.println("   AI signaled to ENTER trade. Parsing parameters...");
                String direction = decision.has("direction") ? decision.get("direction").getAsString().toUpperCase() : "BUY";
                String tp = decision.has("take_profit") ? decision.get("take_profit").getAsString() : null;
                String sl = decision.has("stop_loss") ? decision.get("stop_loss").getAsString() : null;

                if (unitsToTrade <= 0) {
                    System.out.println("   Calculated units to trade is 0 or less. Aborting entry.");
                    return;
                }

                int finalUnits = direction.equals("SELL") || direction.equals("SHORT") ? -unitsToTrade : unitsToTrade;
                oanda.placeOrder(finalUnits, tp, sl);
                
                // Save the placed trade locally
                JsonObject newTrade = new JsonObject();
                newTrade.addProperty("placed_by", "Gemini AI");
                newTrade.addProperty("timestamp", java.time.Instant.now().toString());
                newTrade.addProperty("direction", direction);
                newTrade.addProperty("take_profit", tp != null ? tp : "None");
                newTrade.addProperty("stop_loss", sl != null ? sl : "None");
                newTrade.addProperty("reason_for_entry", decision.has("reason") ? decision.get("reason").getAsString() : "None");
                newTrade.addProperty("status", "OPEN");
                
                tradeHistory.add(newTrade);
                saveTradeHistory(tradeHistory);
                
            } else {
                System.out.println("   AI signaled NO entry.");
            }
        } catch (Exception e) {
            System.err.println("   Failed to parse AI decision or execute trade: " + e.getMessage());
        }
    }

    private static JsonArray loadTradeHistory() {
        try {
            Path path = Paths.get(Config.TRADE_HISTORY_FILE);
            if (Files.exists(path)) {
                String content = Files.readString(path);
                return JsonParser.parseString(content).getAsJsonArray();
            }
        } catch (IOException e) {
            System.err.println("Could not load trade history: " + e.getMessage());
        }
        return new JsonArray();
    }

    private static void saveTradeHistory(JsonArray history) {
        try {
            Files.writeString(Paths.get(Config.TRADE_HISTORY_FILE), history.toString());
        } catch (IOException e) {
            System.err.println("Could not save trade history: " + e.getMessage());
        }
    }
}