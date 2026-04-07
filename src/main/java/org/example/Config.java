package org.example;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

public class Config {

    private static final Properties properties = new Properties();

    static {
        try (InputStream input = Config.class.getClassLoader().getResourceAsStream("config.properties")) {
            if (input == null) {
                System.err.println("❌ Unable to find config.properties in resources folder.");
                System.exit(1);
            }
            properties.load(input);
        } catch (IOException ex) {
            System.err.println("❌ Failed to load config.properties: " + ex.getMessage());
            System.exit(1);
        }
    }

    // --- Loaded from config.properties ---
    public static final String OANDA_TOKEN = properties.getProperty("OANDA_TOKEN");
    public static final String OANDA_ACCOUNT_ID = properties.getProperty("OANDA_ACCOUNT_ID");
    public static final String DISCORD_WEBHOOK_URL = properties.getProperty("DISCORD_WEBHOOK_URL");

    // --- Hardcoded Application Settings ---
    public static final String OANDA_URL = "https://api-fxtrade.oanda.com"; // Use "https://api-fxpractice.oanda.com" for practice
    public static final String INSTRUMENT = "USD_JPY";
    public static final int CANDLE_COUNT = 50;
    public static final double RISK_PERCENTAGE = 0.99; // Use 99% of available max units
    public static final String TRADE_HISTORY_FILE = "trade_history.json";
}