package org.example;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public class OandaService {

    private final HttpClient httpClient;

    public OandaService() {
        this.httpClient = HttpClient.newHttpClient();
    }

    public JsonObject getAccountSummary() throws Exception {
        System.out.println("   Fetching account summary...");
        String url = String.format("%s/v3/accounts/%s/summary", Config.OANDA_URL, Config.OANDA_ACCOUNT_ID);
        HttpRequest request = buildGetRequest(url);
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) throw new RuntimeException("Failed to fetch account summary: " + response.body());
        return JsonParser.parseString(response.body()).getAsJsonObject().getAsJsonObject("account");
    }

    public double getInstrumentMarginRate(String instrument) throws Exception {
        String url = String.format("%s/v3/accounts/%s/instruments?instruments=%s", Config.OANDA_URL, Config.OANDA_ACCOUNT_ID, instrument);
        HttpRequest request = buildGetRequest(url);
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) throw new RuntimeException("Failed to fetch instrument details: " + response.body());
        JsonObject jsonResponse = JsonParser.parseString(response.body()).getAsJsonObject();
        return jsonResponse.getAsJsonArray("instruments").get(0).getAsJsonObject().get("marginRate").getAsDouble();
    }

    public JsonObject checkOpenPositions() throws Exception {
        System.out.println("   Checking for open trades on " + Config.INSTRUMENT + "...");
        String url = String.format("%s/v3/accounts/%s/positions/%s", Config.OANDA_URL, Config.OANDA_ACCOUNT_ID, Config.INSTRUMENT);
        HttpRequest request = buildGetRequest(url);
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        
        if (response.statusCode() == 404) {
            return null; // No position
        } else if (response.statusCode() != 200) {
            throw new RuntimeException("Failed to fetch positions: " + response.body());
        }
        
        JsonObject position = JsonParser.parseString(response.body()).getAsJsonObject().getAsJsonObject("position");
        int longUnits = position.getAsJsonObject("long").get("units").getAsInt();
        int shortUnits = position.getAsJsonObject("short").get("units").getAsInt();
        
        if (longUnits != 0 || shortUnits != 0) {
            return position;
        }
        return null;
    }

    public void placeOrder(int units, String takeProfit, String stopLoss) throws Exception {
        System.out.println("   Placing Market Order: " + units + " units...");
        String url = String.format("%s/v3/accounts/%s/orders", Config.OANDA_URL, Config.OANDA_ACCOUNT_ID);
        
        JsonObject order = new JsonObject();
        order.addProperty("units", String.valueOf(units));
        order.addProperty("instrument", Config.INSTRUMENT);
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
                .header("Authorization", "Bearer " + Config.OANDA_TOKEN)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(orderRequest.toString()))
                .build();
                
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        
        if (response.statusCode() == 201) {
            JsonObject resJson = JsonParser.parseString(response.body()).getAsJsonObject();
            if (resJson.has("orderCancelTransaction")) {
                String cancelReason = resJson.getAsJsonObject("orderCancelTransaction").get("reason").getAsString();
                throw new RuntimeException("OANDA Rejected Order: " + cancelReason);
            }
        } else {
            throw new RuntimeException("HTTP " + response.statusCode() + " from OANDA: " + response.body());
        }
    }

    public String fetchMarketData() throws Exception {
        System.out.println("   Fetching OANDA data for " + Config.INSTRUMENT + "...");
        String h1_candles = fetchCandles("H1");
        String h3_candles = fetchCandles("H3");
        String h4_candles = fetchCandles("H4");
        return "1-Hour Candles:\n" + h1_candles + "\n\n" + "3-Hour Candles:\n" + h3_candles + "\n\n" + "4-Hour Candles:\n" + h4_candles;
    }

    private String fetchCandles(String granularity) throws Exception {
        String url = String.format("%s/v3/instruments/%s/candles?granularity=%s&count=%d&price=M", 
                Config.OANDA_URL, Config.INSTRUMENT, granularity, Config.CANDLE_COUNT);
        
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "Bearer " + Config.OANDA_TOKEN)
                .header("Accept-Datetime-Format", "RFC3339")
                .GET()
                .build();
                
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
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

    private HttpRequest buildGetRequest(String url) {
        return HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Authorization", "Bearer " + Config.OANDA_TOKEN)
                .GET()
                .build();
    }
}