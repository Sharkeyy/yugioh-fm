# Yu-Gi-Oh! Forbidden Memories Helper (DE)

Statische Page mit Tools rund um **Yu-Gi-Oh! Forbidden Memories**:

1) **Fusion Helper**: findet mögliche Fusionen (inkl. Ketten-Fusionen) aus bis zu **5** Handkarten.
2) **Starchip Codes**: Tabellen der Karten-Passwörter, sortiert nach **Star-Chip-Kosten**.

Die App ist komplett **client-side** (HTML/CSS/JS). Es werden keine Server-Komponenten benötigt.

## Live-Seiten

- [`index.html`](index.html) – Fusion Helper
- [`passwords.html`](passwords.html) – Starchip Codes

## Features

### Fusion Helper

- Eingabe von bis zu **5** Karten per **ID** oder **Name** (EN/DE)
- Autocomplete/Suggestions ab 2 Zeichen
- Anzeige von
  - direkten Fusionen (2 Karten)
  - Ketten-Fusionen (bis zu 5 Originalkarten)
- Hinweis auf die **benötigte Reihenfolge** bei Ketten-Fusionen
- Kartenbilder über lokale Assets (`images/de/*.webp`)

Implementierung: [`fusions.js`](fusions.js)

### Starchip Codes

- Darstellung als einklappbare Sektionen (Buckets nach Kosten)
- Deutscher Kartenname wird – falls verfügbar – aus [`cards_merged_de.json`](cards_merged_de.json) übernommen
- Fallback: englischer Name aus den Passwort-Daten

Implementierung: [`passwords.js`](passwords.js)

## Datenquellen / Dateien

- [`cards_merged_de.json`](cards_merged_de.json)
  - Kartenstammdaten inkl. deutscher Namen
  - enthält außerdem Fusion-Daten (wird im Fusion Helper verwendet)
- [`cards_starchips.json`](cards_starchips.json)
  - vorverarbeitete Passwort-/Kosten-Daten für die Starchip-Seite
- [`cards_passwords.txt`](cards_passwords.txt)
  - Rohdatenquelle, aus der `cards_starchips.json` erzeugt wird
- `images/de/*.webp`
  - Kartenbilder (nach ID gepadded, z. B. `001.webp`)

## Credits / Disclaimer

- Kartenbilder: **Yugipedia**.
- Yu-Gi-Oh! ist ein eingetragenes Markenzeichen der jeweiligen Rechteinhaber. Dieses Projekt ist ein Fan-Projekt ohne kommerzielle Absicht.

