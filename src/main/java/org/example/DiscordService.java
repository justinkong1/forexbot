package org.example;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

public class DiscordService {

    private final HttpClient httpClient;

    public DiscordService() {
        this.httpClient = HttpClient.newHttpClient();
    }

    public void sendMessage(String message) throws Exception {
        System.out.println("   Sending message to Discord...");
        if (Config.DISCORD_WEBHOOK_URL == null || Config.DISCORD_WEBHOOK_URL.isEmpty() || Config.DISCORD_WEBHOOK_URL.equals("YOUR_DISCORD_WEBHOOK_URL")) {
            System.err.println("   Discord Webhook URL is not configured. Skipping message.");
            return;
        }
        
        // Escape quotes, slashes, and newlines safely for the JSON embed
        String safeDescription = message.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "");
        String embedJson = String.format("{\"embeds\":[{\"title\":\"USD/JPY Trade Update\",\"description\":\"%s\",\"color\":3447003}]}", safeDescription);
        
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(Config.DISCORD_WEBHOOK_URL))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(embedJson))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() >= 200 && response.statusCode() < 300) {
            System.out.println("   Message sent successfully.");
        } else {
            throw new RuntimeException("Failed to send Discord message. Status: " + response.statusCode() + ", Response: " + response.body());
        }
    }
}