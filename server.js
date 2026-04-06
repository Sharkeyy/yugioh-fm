const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');
const http = require('http');
const fs = require('fs');
const net = require('net');
const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Statische Dateien aus dem "public" Verzeichnis bereitstellen
app.use(express.static(path.join(__dirname, 'public')));

// Karten-Tabelle zum Übersetzen der IDs für die Konsole
let cardIndex = {};
try {
    const cardsJson = fs.readFileSync(path.join(__dirname, 'public/data/cards_merged_de.json'), 'utf8');
    JSON.parse(cardsJson).forEach(c => {
        cardIndex[c.Id] = c.Name_DE || c.Name;
    });
} catch (e) {
    console.error("Konnte Karten nicht für Console-Log laden:", e.message);
}
app.use(express.text({ type: '*/*' })); // Liest alles als Text ein (da BizHawk keinen Content-Type setzt)
app.use(express.json()); // Fallback

let clients = new Set();

wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('Frontend per WebSocket verbunden.');
    ws.on('close', () => {
        clients.delete(ws);
        console.log('Frontend getrennt.');
    });
});

// GDB-Verbindung zu DuckStation
const GDB_PORT = 2345;
let gdbClient = null;
let lastPayloadStr = "";

function createGDBPacket(cmd) {
    let sum = 0;
    for (let i = 0; i < cmd.length; i++) {
        sum = (sum + cmd.charCodeAt(i)) & 255;
    }
    const hexSum = sum.toString(16).padStart(2, '0').toLowerCase();
    return `$${cmd}#${hexSum}`;
}

function connectToEmulator() {
    if (gdbClient) return;
    gdbClient = new net.Socket();
    
    gdbClient.connect(GDB_PORT, 'localhost', () => {
        console.log('Mit DuckStation (GDB) verbundn! Starte Speicher-Scan...');
        pollEmulator();
    });

    gdbClient.on('error', (err) => {
        // Ignoriere fehlgeschlagene Verbindungsversuche auf der Konsole, versuche es stumm weiter
        // console.log("Verbindungsversuch gescheitert (Duckstation aus?):", err.message);
        gdbClient.destroy();
        gdbClient = null;
    });

    gdbClient.on('close', () => {
        gdbClient = null;
        isPolling = false;
        setTimeout(connectToEmulator, 2000); // Reconnect loop
    });

    let buffer = "";
    gdbClient.on('data', (data) => {
        buffer += data.toString();
        
        let startIdx = buffer.indexOf('$');
        let endIdx = buffer.indexOf('#', startIdx);
        
        while (startIdx !== -1 && endIdx !== -1 && buffer.length >= endIdx + 3) {
            let payload = buffer.substring(startIdx + 1, endIdx);
            buffer = buffer.substring(endIdx + 3);
            
            // Handle different packet responses
            if (payload.length === 2) {
                // Duel State (1 byte = 2 hex chars)
                handleDuelStateResponse(payload);
            } else if (payload.length >= 560) {
                // Hand und Feld Daten (140 + 140 = 280 bytes = 560 hex chars)
                handleMemoryResponse(payload);
            } else {
                // Irgendein anderes Paket, wir machen weiter
                setTimeout(() => { isPolling = false; pollEmulator(); }, 500);
            }
            
            startIdx = buffer.indexOf('$');
            endIdx = buffer.indexOf('#', startIdx);
        }
    });
}

let isPolling = false;
function pollEmulator() {
    if (!gdbClient || isPolling) return;
    isPolling = true;
    
    // Zuerst Duel State abfragen (0x9b23a)
    gdbClient.write(createGDBPacket('m8009b23a,1'));
}

// Memory Processing
function handleDuelStateResponse(hexStr) {
    let duelState = parseInt(hexStr, 16);
    // Status: 00 (Out of Duel), 01 (Intro), >= 0x0C (Endings: Win/Lose, Results, Exodia)
    if (duelState === 0x00 || duelState === 0x01 || duelState >= 0x0C) {
        sendToFrontend({ hand: [0,0,0,0,0], field: [0,0,0,0,0] });
        setTimeout(() => { isPolling = false; pollEmulator(); }, 500); // Naechster Scan in 500ms
    } else {
        // Frage echte Karten an 
        // 0x118 bytes (280 bytes) von Hand (0x801A7AE4) bis inkl Feld
        if(gdbClient) gdbClient.write(createGDBPacket('m801a7ae4,118'));
    }
}

function handleMemoryResponse(hexStr) {
    let hand = parseCardList(hexStr, 0);       // Start bei 0 offset in den gepullten Daten
    let field = parseCardList(hexStr, 280);    // Feld beginnt 140 bytes später (280 hex chars)
    
    sendToFrontend({ hand, field });
    setTimeout(() => { isPolling = false; pollEmulator(); }, 500); // Naechster Scan in 500ms
}

function parseCardList(hexStr, charOffset) {
    let result = [];
    for (let i = 0; i < 5; i++) {
        // Eine Karte ist 28 Bytes groß = 56 Hex-Zeichen
        let slotBase = charOffset + (i * 56);
        let idHexLE = hexStr.slice(slotBase, slotBase + 4); 
        let idByte0 = parseInt(idHexLE.slice(0, 2), 16);
        let idByte1 = parseInt(idHexLE.slice(2, 4), 16);
        let cardId = (idByte1 << 8) | idByte0;
        
        // Existance flag at +0x0B (offset 22 chars)
        let existHex = hexStr.slice(slotBase + 22, slotBase + 24);
        let exists = (parseInt(existHex, 16) & 0x80) !== 0;
        
        if (cardId === 65535 || !exists || isNaN(cardId)) cardId = 0;
        result.push(cardId);
    }
    return result;
}

function sendToFrontend(data) {
    const payloadStr = JSON.stringify(data);
    if (payloadStr === lastPayloadStr) return; // Nur senden wenn es sich aendert
    lastPayloadStr = payloadStr;
    
    console.log("==== NEUE KARTEN VOM EMULATOR ====");
    const mapNames = ids => ids ? ids.map(id => id === 0 ? '[Leer]' : (cardIndex[id] || `Unbekannte ID ${id}`)) : [];
    console.log("Hand:", mapNames(data.hand).join(" | "));
    console.log("Feld:", mapNames(data.field).join(" | "));
    
    const message = JSON.stringify({ type: 'update_cards', payload: data });
    for (const client of clients) {
        if (client.readyState === 1) client.send(message);
    }
}

// Startpolling der DuckStation TCP Loop
connectToEmulator();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server laeuft auf http://localhost:${PORT}`);
    console.log('Oeffne Browser...');
    
    // Automatisch den Standard-Browser oeffnen
    const startCmd = process.platform === 'win32' ? 'start' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
    exec(`${startCmd} http://localhost:${PORT}`, (err) => {
        if (err) console.error("Konnte Browser nicht automatisch oeffnen (Bitte manuell http://localhost:3000 eingeben).");
    });
});
