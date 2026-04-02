const express = require('express');
const { WebSocketServer } = require('ws');
const path = require('path');
const http = require('http');
const fs = require('fs');

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

// Endpoint für den BizHawk Emulator
app.post('/api/update-cards', (req, res) => {
    let data = {};
    try {
        let bodyString = typeof req.body === 'string' ? req.body : '';
        // BizHawk sendet die Daten als URL-enkodierten Form-Parameter 'payload=...'
        if (bodyString.startsWith('payload=')) {
            bodyString = decodeURIComponent(bodyString.substring(8).replace(/\+/g, '%20'));
        }
        data = bodyString ? JSON.parse(bodyString) : req.body;
        console.log("==== NEUE KARTEN VOM EMULATOR ====");
        const mapNames = ids => ids ? ids.map(id => id === 0 ? '[Leer]' : (cardIndex[id] || `Unbekannte ID ${id}`)) : [];
        console.log("Hand:", mapNames(data.hand).join(" | "));
        console.log("Feld:", mapNames(data.field).join(" | "));
    } catch (e) {
        console.error("JSON Parse Error:", e.message);
    }
    // Erwartetes Format: { hand: [id1, ...], field: [id1, ...] }
    
    const message = JSON.stringify({ type: 'update_cards', payload: data });
    
    // An alle verbundenen "Browser" Clients senden
    for (const client of clients) {
        if (client.readyState === 1) { // OPEN
            client.send(message);
        }
    }
    
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server laeuft auf http://localhost:${PORT}`);
});
