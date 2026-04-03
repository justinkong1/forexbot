package org.example;

import com.google.genai.Client;
import com.google.genai.types.GenerateContentResponse;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class TradingBot {

    // --- 1. USER CONFIGURATION ---
    // OANDA Configuration
    private static final String OANDA_URL = "https://api-fxtrade.oanda.com"; // Use "https://api-fxtrade.oanda.com" for live account
    private static final String OANDA_TOKEN = "12561e1c24b50cd41a92043aff715a1c-94167d57f2df19484e54d515bfc420ed"; // Replace with your OANDA Personal Access Token
    // IMPORTANT: Make sure this is your correct OANDA Account ID to place trades
    private static final String OANDA_ACCOUNT_ID = "001-001-13224926-001"; // TODO: Fill this in!

    // Gemini AI Configuration
    // IMPORTANT: Set your Gemini API key as an environment variable named "GOOGLE_API_KEY"

    // Discord Configuration
    private static final String DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1489439983755333734/21YQdnQnKazro9Y3LLi0MHh-ZItx_5ri71B6C5KQf43Jl2A1tcCDA0F3t60W1U3LXQsY";

    // Trading Configuration
    private static final String INSTRUMENT = "USD_JPY";
    private static final int CANDLE_COUNT = 50; // Number of candles to fetch
    private static final double RISK_PERCENTAGE = 0.99; // Use 99% of available max units

    private static final HttpClient HTTP_CLIENT = HttpClient.newHttpClient();

    public static void main(String[] args) {
        // --- 2. SCHEDULER ---
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
            JsonObject accountSummary = getAccountSummary();
            double marginAvailable = accountSummary.get("marginAvailable").getAsDouble();
            double balance = accountSummary.get("balance").getAsDouble();
            
            JsonObject openPosition = checkOpenPositions();
            boolean currentlyInTrade = openPosition != null;

            // Prepare account info string for Discord
            StringBuilder accountInfo = new StringBuilder();
            accountInfo.append("💰 **Account Status:**\n");
            accountInfo.append("- Balance: $").append(String.format("%.2f", balance)).append("\n");
            accountInfo.append("- Available Margin: $").append(String.format("%.2f", marginAvailable)).append("\n");
            
            String aiAnalysisJson = "";

            if (currentlyInTrade) {
                // If we are in a trade, we SKIP the AI analysis and let OANDA's TP/SL handle the exit.
                int longUnits = openPosition.getAsJsonObject("long").get("units").getAsInt();
                int shortUnits = openPosition.getAsJsonObject("short").get("units").getAsInt();
                double pl = openPosition.get("unrealizedPL").getAsDouble();
                accountInfo.append("\n📈 **Current Open Trade (").append(INSTRUMENT).append("):**\n");
                accountInfo.append("- Long Units: ").append(longUnits).append("\n");
                accountInfo.append("- Short Units: ").append(shortUnits).append("\n");
                accountInfo.append("- Unrealized P/L: $").append(String.format("%.2f", pl)).append(pl >= 0 ? " 🟢" : " 🔴").append("\n");
                
                System.out.println("   Currently in a trade. Skipping AI entry analysis and letting OANDA handle TP/SL.");
                aiAnalysisJson = "{\n  \"signal\": \"HOLD\",\n  \"reason\": \"Currently in an active trade. Letting OANDA handle the Take Profit or Stop Loss.\"\n}";
                
            } else {
                accountInfo.append("\n📉 **No Open Trades.**\n");

                // --- 2. FETCH MARKET DATA ---
                String marketData = fetchOandaData();
                int tradeUnits = 0;

                // Calculate trade size
                double instrumentMarginRate = getInstrumentMarginRate(INSTRUMENT);
                double maxUnits = marginAvailable / instrumentMarginRate;
                tradeUnits = (int) (maxUnits * RISK_PERCENTAGE);
                
                System.out.printf("   Calculation: Margin: %.2f / Instrument Rate: %.2f = Max Units: %.2f%n", marginAvailable, instrumentMarginRate, maxUnits);
                System.out.printf("   Applying %.2f%% risk. Units to trade: %d%n", RISK_PERCENTAGE * 100, tradeUnits);

                // --- 3. GET AI DECISION ---
                aiAnalysisJson = getAiAnalysis(marketData);

                // --- 4. EXECUTE TRADE LOGIC ---
                executeTradeDecision(aiAnalysisJson, tradeUnits);
            }

            // --- 5. SEND RESULT TO DISCORD ---
            // Clean any potential markdown from the AI so we can safely wrap it in our own JSON block
            String cleanJsonForDiscord = aiAnalysisJson.replace("```json", "").replace("```", "").trim();
            String finalDiscordMessage = accountInfo.toString() + "\n🤖 **AI Analysis & Decision:**\n```json\n" + cleanJsonForDiscord + "\n```";
            sendDiscordMessage(finalDiscordMessage);

        } catch (Exception e) {
            String errorMessage = "❌ An error occurred: " + e.getMessage();
            System.err.println(errorMessage);
            try {
                sendDiscordMessage(errorMessage);
            } catch (Exception discordError) {
                System.err.println("❌ Failed to send error message to Discord: " + discordError.getMessage());
            }
        }
    }

    /**
     * Fetches the full account summary from OANDA.
     */
    private static JsonObject getAccountSummary() throws Exception {
        System.out.println("   Fetching account summary...");
        String url = String.format("%s/v3/accounts/%s/summary", OANDA_URL, OANDA_ACCOUNT_ID);
        HttpRequest request = HttpRequest.newBuilder().uri(URI.create(url)).header("Authorization", "Bearer " + OANDA_TOKEN).GET().build();
        HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) throw new RuntimeException("Failed to fetch account summary: " + response.body());
        return JsonParser.parseString(response.body()).getAsJsonObject().getAsJsonObject("account");
    }

    /**
     * Fetches the specific margin rate for a given instrument.
     * Different pairs have different leverage/margin requirements (e.g. 50:1 vs 20:1).
     */
    private static double getInstrumentMarginRate(String instrument) throws Exception {
        String url = String.format("%s/v3/accounts/%s/instruments?instruments=%s", OANDA_URL, OANDA_ACCOUNT_ID, instrument);
        HttpRequest request = HttpRequest.newBuilder().uri(URI.create(url)).header("Authorization", "Bearer " + OANDA_TOKEN).GET().build();
        HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) throw new RuntimeException("Failed to fetch instrument details: " + response.body());
        JsonObject jsonResponse = JsonParser.parseString(response.body()).getAsJsonObject();
        return jsonResponse.getAsJsonArray("instruments").get(0).getAsJsonObject().get("marginRate").getAsDouble();
    }

    /**
     * Checks if there are any open trades (positions) for the current instrument.
     */
    private static JsonObject checkOpenPositions() throws Exception {
        System.out.println("   Checking for open trades on " + INSTRUMENT + "...");
        String url = String.format("%s/v3/accounts/%s/positions/%s", OANDA_URL, OANDA_ACCOUNT_ID, INSTRUMENT);
        HttpRequest request = HttpRequest.newBuilder().uri(URI.create(url)).header("Authorization", "Bearer " + OANDA_TOKEN).GET().build();
        HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() == 404) {
            System.out.println("   Currently NOT in a trade.");
            return null;
        } else if (response.statusCode() != 200) {
            throw new RuntimeException("Failed to fetch positions: " + response.body());
        }
        JsonObject position = JsonParser.parseString(response.body()).getAsJsonObject().getAsJsonObject("position");
        int longUnits = position.getAsJsonObject("long").get("units").getAsInt();
        int shortUnits = position.getAsJsonObject("short").get("units").getAsInt();
        if (longUnits != 0 || shortUnits != 0) {
            System.out.println("   Currently IN a trade. Long units: " + longUnits + ", Short units: " + shortUnits);
            return position;
        }
        System.out.println("   Currently NOT in a trade.");
        return null;
    }

    /**
     * Executes the AI decision to Enter a trade.
     */
    private static void executeTradeDecision(String analysisJsonString, int unitsToTrade) {
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
                placeOrder(finalUnits, tp, sl);
            } else {
                System.out.println("   AI signaled NO entry.");
            }
        } catch (Exception e) {
            System.err.println("   Failed to parse AI decision or execute trade: " + e.getMessage());
        }
    }

    /**
     * Places a market order with OANDA.
     */
    private static void placeOrder(int units, String takeProfit, String stopLoss) throws Exception {
        System.out.println("   Placing Market Order: " + units + " units...");
        String url = String.format("%s/v3/accounts/%s/orders", OANDA_URL, OANDA_ACCOUNT_ID);
        
        JsonObject order = new JsonObject();
        order.addProperty("units", String.valueOf(units));
        order.addProperty("instrument", INSTRUMENT);
        order.addProperty("timeInForce", "FOK");
        order.addProperty("type", "MARKET");
        order.addProperty("positionFill", "DEFAULT");
        
        if (takeProfit != null && !takeProfit.isEmpty() && !takeProfit.equalsIgnoreCase("null")) {
            JsonObject tpObj = new JsonObject();
            tpObj.addProperty("price", takeProfit);
            order.add("takeProfitOnFill", tpObj);
        }
        if (stopLoss != null && !stopLoss.isEmpty() && !stopLoss.equalsIgnoreCase("null")) {
            JsonObject slObj = new JsonObject();
            slObj.addProperty("price", stopLoss);
            order.add("stopLossOnFill", slObj);
        }
        
        JsonObject orderRequest = new JsonObject();
        orderRequest.add("order", order);
        
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "Bearer " + OANDA_TOKEN)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(orderRequest.toString()))
                .build();
                
        HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
        
        // In OANDA v20, a 201 Created just means the order request was processed.
        // It could have been immediately cancelled (e.g. invalid Stop Loss, Insufficient Margin).
        if (response.statusCode() == 201) {
            JsonObject resJson = JsonParser.parseString(response.body()).getAsJsonObject();
            
            // Check if OANDA immediately cancelled the order
            if (resJson.has("orderCancelTransaction")) {
                String cancelReason = resJson.getAsJsonObject("orderCancelTransaction").get("reason").getAsString();
                System.err.println("   ❌ Order was rejected/cancelled by OANDA. Reason: " + cancelReason);
                throw new RuntimeException("OANDA Rejected Order: " + cancelReason);
            } else if (resJson.has("orderFillTransaction")) {
                System.out.println("   ✅ Order filled successfully!");
            } else {
                System.out.println("   ✅ Order submitted.");
            }
        } else {
            System.err.println("   ❌ Failed to place order. Status: " + response.statusCode());
            System.err.println("   Response: " + response.body());
            throw new RuntimeException("HTTP " + response.statusCode() + " from OANDA: " + response.body());
        }
    }

    /**
     * Fetches candlestick data for 1H, 3H, and 4H timeframes directly using OANDA's REST v20 API.
     */
    private static String fetchOandaData() throws Exception {
        System.out.println("   Fetching OANDA data for " + INSTRUMENT + "...");
        String h1_candles = fetchCandles("H1");
        String h3_candles = fetchCandles("H3");
        String h4_candles = fetchCandles("H4");
        return "1-Hour Candles:\n" + h1_candles + "\n\n" + "3-Hour Candles:\n" + h3_candles + "\n\n" + "4-Hour Candles:\n" + h4_candles;
    }

    private static String fetchCandles(String granularity) throws Exception {
        String url = String.format("%s/v3/instruments/%s/candles?granularity=%s&count=%d&price=M", OANDA_URL, INSTRUMENT, granularity, CANDLE_COUNT);
        HttpRequest request = HttpRequest.newBuilder().uri(URI.create(url)).header("Authorization", "Bearer " + OANDA_TOKEN).header("Accept-Datetime-Format", "RFC3339").GET().build();
        HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) throw new RuntimeException("OANDA API Error: " + response.statusCode() + " " + response.body());
        
        JsonObject jsonResponse = JsonParser.parseString(response.body()).getAsJsonObject();
        JsonArray candles = jsonResponse.getAsJsonArray("candles");
        StringBuilder formatted = new StringBuilder();
        
        for (JsonElement element : candles) {
            JsonObject candle = element.getAsJsonObject();
            if (candle.get("complete").getAsBoolean()) {
                String time = candle.get("time").getAsString();
                JsonObject mid = candle.getAsJsonObject("mid");
                formatted.append(String.format("T: %s, O: %s, H: %s, L: %s, C: %s\n", 
                    time, mid.get("o").getAsString(), mid.get("h").getAsString(), mid.get("l").getAsString(), mid.get("c").getAsString()));
            }
        }
        return formatted.toString();
    }

    private static String getAiAnalysis(String marketData) throws Exception {
        System.out.println("   Sending data to Gemini AI for analysis...");
        try (Client genAiClient = new Client()) {
            String prompt = "You are an expert forex trading analyst. Analyze the provided candlestick data for " + INSTRUMENT + " to determine if a high-probability trade setup exists to ENTER a trade.\n\n" + 
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

    private static void sendDiscordMessage(String message) throws Exception {
        System.out.println("   Sending message to Discord...");
        if (DISCORD_WEBHOOK_URL == null || DISCORD_WEBHOOK_URL.isEmpty() || DISCORD_WEBHOOK_URL.equals("YOUR_DISCORD_WEBHOOK_URL")) {
            System.err.println("   Discord Webhook URL is not configured. Skipping message.");
            return;
        }
        
        // Escape quotes, slashes, and newlines safely for the JSON embed
        String safeDescription = message.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "");
        String embedJson = String.format("{\"embeds\":[{\"title\":\"USD/JPY Trade Update\",\"description\":\"%s\",\"color\":3447003}]}", safeDescription);
        
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(DISCORD_WEBHOOK_URL))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(embedJson))
                .build();

        HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 200 && response.statusCode() < 300) {
            System.out.println("   Message sent successfully.");
        } else {
            throw new RuntimeException("Failed to send Discord message. Status: " + response.statusCode() + ", Response: " + response.body());
        }
    }
}