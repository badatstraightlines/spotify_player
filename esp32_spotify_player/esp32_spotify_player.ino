#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>

// ==========================================
// CONFIGURATION
// ==========================================
const char* ssid = "Galaxy A34 5G CE6F";
const char* password = "apple356";

// The local IP of your Node.js proxy server
const char* proxy_ip = "10.36.129.32"; 
const int proxy_port = 8888;

// OLED Setup (I2C)
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET    -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// Pins for Push Buttons
// Connect button to pin and GND
#define BTN_PLAY_PAUSE 4
#define BTN_NEXT       5

// ==========================================
// STATE VARIABLES
// ==========================================
bool isPlaying = false;
String currentTitle = "Connecting...";
String currentArtist = "";

unsigned long lastPollTime = 0;
const unsigned long pollInterval = 3000; // Poll every 3 seconds

unsigned long lastBtnPlayPause = 0;
unsigned long lastBtnNext = 0;
const int debounceDelay = 300; // 300ms debounce

void setup() {
    Serial.begin(115200);

    // Initialize Buttons (internal pullups, button connects pin to GND)
    pinMode(BTN_PLAY_PAUSE, INPUT_PULLUP);
    pinMode(BTN_NEXT, INPUT_PULLUP);

    // Initialize OLED
    // Default I2C pins for ESP32: SDA = 21, SCL = 22
    if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
        Serial.println(F("SSD1306 allocation failed"));
        for(;;);
    }
    
    display.clearDisplay();
    display.setTextColor(WHITE);
    display.setTextSize(1);
    display.setCursor(0, 16);
    display.println("Connecting WiFi...");
    display.display();

    // Connect to WiFi
    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println("\nWiFi connected");
    
    currentTitle = "WiFi Connected";
    updateDisplay();
}

void loop() {
    // 1. Handle Button Presses
    if (digitalRead(BTN_PLAY_PAUSE) == LOW) {
        if (millis() - lastBtnPlayPause > debounceDelay) {
            sendControlCommand(isPlaying ? "pause" : "play");
            lastBtnPlayPause = millis();
            // Optimistic update
            isPlaying = !isPlaying;
            updateDisplay();
        }
    }
    
    if (digitalRead(BTN_NEXT) == LOW) {
        if (millis() - lastBtnNext > debounceDelay) {
            sendControlCommand("next");
            lastBtnNext = millis();
        }
    }

    // 2. Poll the Node.js Proxy for Currently Playing
    if (millis() - lastPollTime > pollInterval) {
        fetchNowPlaying();
        lastPollTime = millis();
    }
}

void fetchNowPlaying() {
    if (WiFi.status() != WL_CONNECTED) return;

    HTTPClient http;
    String url = String("http://") + proxy_ip + ":" + proxy_port + "/now-playing";
    http.begin(url);
    
    int httpCode = http.GET();
    
    if (httpCode == 200) {
        String payload = http.getString();
        
        // Parse JSON (Adjust capacity if needed)
        StaticJsonDocument<512> doc;
        DeserializationError error = deserializeJson(doc, payload);
        
        if (!error) {
            bool playing = doc["is_playing"];
            const char* title = doc["title"];
            const char* artist = doc["artist"];

            isPlaying = playing;
            if (title && artist) {
                currentTitle = String(title);
                currentArtist = String(artist);
            } else {
                currentTitle = "Nothing Playing";
                currentArtist = "";
            }
            updateDisplay();
        } else {
            Serial.println("JSON Parsing failed");
        }
    } else {
        Serial.printf("GET failed, error: %s\n", http.errorToString(httpCode).c_str());
    }
    http.end();
}

void sendControlCommand(String action) {
    if (WiFi.status() != WL_CONNECTED) return;

    HTTPClient http;
    String url = String("http://") + proxy_ip + ":" + proxy_port + "/control";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    
    String payload = "{\"action\":\"" + action + "\"}";
    int httpCode = http.POST(payload);
    
    if (httpCode > 0) {
        Serial.printf("POST action %s -> %d\n", action.c_str(), httpCode);
    } else {
        Serial.printf("POST failed, error: %s\n", http.errorToString(httpCode).c_str());
    }
    http.end();
}

void updateDisplay() {
    display.clearDisplay();
    
    // Playback Status Header
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.print(isPlaying ? "> PLAYING" : "|| PAUSED");
    
    display.drawLine(0, 10, SCREEN_WIDTH, 10, WHITE);
    
    // Song Title
    display.setCursor(0, 16);
    display.print("Song:");
    display.setCursor(0, 26);
    display.print(currentTitle);
    
    // Artist
    display.setCursor(0, 44);
    display.print("Artist:");
    display.setCursor(0, 54);
    display.print(currentArtist);
    
    display.display();
}
