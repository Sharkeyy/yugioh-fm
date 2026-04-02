-- YUGIOH FORBIDDEN MEMORIES - BIZHAWK AUTOMATION SYNC --
-- Dieses Skript liest die Karten-IDs der Hand und des Spielfelds
-- aus dem RAM und sendet sie an den lokalen Node.js Server.

local RAM_ADDRESSES = {
    -- Die echten Player Hand Adressen (aus der vollständig ausgelesenen ram_map.txt!)
    HAND = {
        0x1A7AE4, -- Handkarte 1
        0x1A7B00, -- Handkarte 2
        0x1A7B1C, -- Handkarte 3
        0x1A7B38, -- Handkarte 4
        0x1A7B54  -- Handkarte 5
    },
    -- Die Spielfeldkarten sind vollwertige "Karten-Objekte" mit 28 Bytes Abstand, entnommen aus der ram_map.txt
    FIELD = {
        0x1A7B70, -- Spielfeldkarte 1 (Player - Monster Card Slot 1)
        0x1A7B8C, -- Spielfeldkarte 2 (Player - Monster Card Slot 2)
        0x1A7BA8, -- Spielfeldkarte 3 (Player - Monster Card Slot 3)
        0x1A7BC4, -- Spielfeldkarte 4 (Player - Monster Card Slot 4)
        0x1A7BE0  -- Spielfeldkarte 5 (Player - Monster Card Slot 5)
    }
}

-- Server Konfiguration
local SERVER_URL = "http://localhost:3000/api/update-cards"

function getCardList(addressTable)
    local result = {}
    for i, addr in ipairs(addressTable) do
        local cardId = mainmemory.read_u16_le(addr)
        
        -- An Offset +0x0B prüfen wir das Data-Byte auf das "Existance Flag" (Bit 7 = 0x80)
        local dataByte = mainmemory.read_u8(addr + 0x0B)
        local exists = (dataByte & 0x80) ~= 0
        
        -- Im Spiel repräsentiert 0xFFFF (65535) oder 0 einen leeren Slot, 
        -- oder die Karte ist durch das "Existance Flag" inaktiviert!
        if cardId == 65535 or not exists then 
            cardId = 0 
        end
        
        table.insert(result, cardId)
    end
    return result
end

function sendToServer(handData, fieldData)
    -- JSON String manuell bauen um lua-cjson Abhängigkeit zu vermeiden
    local handJson = "[" .. table.concat(handData, ",") .. "]"
    local fieldJson = "[" .. table.concat(fieldData, ",") .. "]"
    local payload = '{"hand": ' .. handJson .. ', "field": ' .. fieldJson .. '}'
    
    local success, response = pcall(function()
        return comm.httpPost(SERVER_URL, payload)
    end)
end

local lastPayload = ""

console.log("Yu-Gi-Oh! FM Sync gestartet. Warte auf Änderungen im Spiel...")

local DUEL_STATE_ADDR = 0x9b23a

while true do
    local duelState = mainmemory.read_u8(DUEL_STATE_ADDR)
    local handData = {}
    local fieldData = {}
    
    -- Status: 00 (Out of Duel), 01 (Intro), >= 0x0C (Endings: Win/Lose, Results, Exodia)
    if duelState == 0x00 or duelState == 0x01 or duelState >= 0x0C then
        handData = {0, 0, 0, 0, 0}
        fieldData = {0, 0, 0, 0, 0}
    else
        handData = getCardList(RAM_ADDRESSES.HAND)
        fieldData = getCardList(RAM_ADDRESSES.FIELD)
    end
    
    local currentPayload = table.concat(handData, ",") .. "|" .. table.concat(fieldData, ",")
    
    -- Nur zum Server senden, wenn sich im Spiel etwas ändert
    if currentPayload ~= lastPayload then
        sendToServer(handData, fieldData)
        lastPayload = currentPayload
        console.log("Neue Karten erkannt! Updates an lokales Web-Tool gesendet.")
    end
    
    -- Warte exakt einen Frame (wichtig, sonst stürzt der Emulator ab!)
    emu.frameadvance()
end
