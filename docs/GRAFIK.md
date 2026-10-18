# Wie das Spiel zeichnet (Grundlage für den HD-Renderer)

Stand: 18.10.2026. Alle Adressen gelten für **START.EXE mit 147 200 Bytes** (deutsche Version mit SETUP.EXE und READ.ME). Die ältere Fassung (148 480 Bytes) hat dieselbe Struktur, aber verschobene Offsets.

## Werkzeuge

| Werkzeug | Zweck |
|---|---|
| Ghidra 11.3.1 (headless) | lädt das NE-Format direkt, Auto-Analyse findet 398 Funktionen |
| `tools/ghidra/ExportKellogg.java` | exportiert Funktionsliste (`functions.json`) und Pseudocode einzelner Funktionen (`seg:off`) |
| `tools/trace-draw.mjs` | spielt ins Level und zählt, welcher Code in den VGA-Speicher schreibt, inklusive Aufrufer |
| `tools/dump-scene.mjs` | liest Kamera, Kartenbreite und Sprite-Liste live aus dem Speicher |
| `docs/map.json` | Funktionskarte (Ghidra-Adresse, NE-Segment, Offset, Größe, eigene Namen) |

[REA](https://github.com/morluto/rea) (MCP-Server für Reverse Engineering) ist installiert, lehnt aber NE-Programme ab („unsupported NE executable in MZ image“). Wir nutzen daher Ghidra direkt, das auch REA intern verwendet.

Ghidra-Adressen: NE-Segment n liegt bei `1000 + 8·(n−1)`, also seg1 = `1000:`, seg3 = `1010:`, DGROUP (seg6) = `1028:`.

```
analyzeHeadless proj kellogg -import START.EXE
analyzeHeadless proj kellogg -process START.EXE -noanalysis -scriptPath tools/ghidra \
  -postScript ExportKellogg.java out 3:29b2 3:b073
```

## Ablauf eines Bildes (`FUN_1000_0963`)

1. `FUN_1010_29b2` **scroll_update**: Kamera bewegen, für jede neu sichtbare Pixelspalte `draw_tile_column`, für jede neue Zeile `draw_tile_row`. Dazu eine Kopie in den Hintergrundpuffer (`copy_column_to_background`).
2. `FUN_1010_b073` **draw_sprite_list**: alle Einträge der Sprite-Liste zeichnen.
3. `FUN_1010_3aa0` / `FUN_1010_b140`: Hintergrund unter den Sprites des vorigen Bildes per Latch-Kopie wiederherstellen (Dirty Rectangles, doppelt gepufferte Liste).

Pro Bild schreibt das Spiel nur 2–3 KB in den Bildspeicher: Der Rest ist Hardware-Scrolling über einen Ringpuffer im VGA-RAM (Mode X 320×200, Zeilenbreite 84 Bytes = 336 Pixel).

## Wichtige Variablen in DGROUP (`1028:`)

| Adresse | Bedeutung |
|---|---|
| `c1c6` / `c1ca` | Kamera in Weltkoordinaten (16.16 Festkomma, ganzzahliger Teil bei `c1c8` / `c1cc`) |
| `c1ae` / `c1b2` | Scroll-Position im VGA-Ringpuffer (16.16) |
| `73f0`–`73f6` | Kamera-Grenzen (x min, y min, x max, y max), Level 1: 0, 0, 3168, 576 |
| `9e7e` / `9e82` | Scroll-Geschwindigkeit x/y |
| `b588` (far) | Level-Karte: 16-Bit-Einträge, Kachelnummer = `eintrag & 0x1FF`, Rest Kollision |
| `b58c` | Bytes pro Kartenzeile (Level 1: 436 = 218 Kacheln) |
| `b590` / `63e6` | Animationstabelle der Kacheln (Kachel → Grafikindex) |
| `b594` + GS | Kachelgrafik: 16×16 Pixel, 256 Bytes, nach Planes sortiert (Index `(x&3)<<2 \| (x&15)>>2`, Zeilen à 16 Bytes) |
| `b59a` (far), `c188` | **Sprite-Liste** dieses Bildes und Anzahl |
| `b59e` (far), `63e4` | Bildbeschreibungen der Sprites (Einträge à 0x2C Bytes) |
| `b5a2` | Bildnummer → Index in die Bildbeschreibungen (−1 = kein Bild) |
| `757e`/`7580`, `7582`/`7584` | Dirty-Rectangle-Listen (aktuelles/voriges Bild) |

### Sprite-Liste (Eintrag 8 Bytes)

| Offset | Inhalt |
|---|---|
| 0 | x in Weltkoordinaten |
| 2 | y in Weltkoordinaten |
| 4 | Bildnummer, obere Bits Flags (`& 0xB000` ≠ 0: nicht zeichnen) |
| 6 | Byte ≠ 0: ausgeblendet; Bit 8 (`0x100`): Sonderzeichnung (GC-Register gesetzt, z. B. Aufblitzen) |

### Bildbeschreibung (0x2C Bytes)

| Offset | Inhalt |
|---|---|
| 0 / 2 | Breite / Höhe |
| 8 / 10 | Hotspot x / y (wird von der Position abgezogen) |
| 0x18 (far) | Zeiger auf den **kompilierten Zeichencode** des Bildes |

Sprites sind kompilierter Code (die .BOB-Daten): Jedes Bild ist ein kleines x86-Programm, das mit `ES:DI` = Bildspeicheradresse die Pixel direkt schreibt, eine Variante je Plane-Ausrichtung (`x & 3`). Aufgerufen per Far-Call aus `seg3:0457` (`draw_sprite`) und `seg3:05ff` (`draw_sprite_simple`).

Beispiel aus `tools/dump-scene.mjs`, Level 1 beim Loslaufen: Kamera (128, 502), Sprites `3a8@(192,592) 32×48` und Tony `0@(288,640) 32×56`; nach 1,5 s nach rechts Kamera (220, 502), Tony `1@(410,640)`.

## Breitbild-Prototyp (`web/scene.js`)

Umgesetzt und im Browser schaltbar („Breitbild“):

- **Szene pro Bild**: Haltepunkt am Anfang von `draw_sprite_list` (seg3:b073) liest Kamera (`c1c8`/`c1cc`) und Sprite-Liste.
- **Kacheln**: Karte über far `b588` (Eintrag `& 0x1FF`), Grafikindex aus der **far-Tabelle `b590`** (4 Bytes je Kachel, Selektor in `b592`), Kachelbytes ab **far `b594`** (Selektor = das GS der Zeichenroutine), Offset `index·256` **mit 32 Bit** (Kacheln über Index 255 liegen jenseits von 64 KB: Wolken, Baumstamm).
- **Sprites**: Haltepunkt bei `draw_sprite` (seg3:0002; Stack: `flags` bei SP+4, `frame` +6, `y` +8, `x` +10). Solange der kompilierte Sprite-Code läuft, werden seine VGA-Schreibzugriffe in Sprite-Koordinaten umgerechnet (Ring: Basis `c1d4`, Zeilenbreite `c1d0`, Ringgröße `c1da`, Scroll `c1b0`/`c1b4`) und je Bildnummer als Indexbild gecacht. Nur vollständig sichtbare Sprites werden mitgeschnitten; fehlt ein Bild noch, kommt sein Rahmen aus dem Originalbild.
- **Paletten-Trick**: die PEL-Maske je Bildzeile (`vga.rowMask`) wird auch im Breitbild pro Zeile angewendet.
- **Statusleiste**: aus dem Originalbild, mittig.
- **Breite**: 320 + 2·53 = 426 Spielpixel, auf 16:9 skaliert (die Pixel sind wie im Original höher als breit).
- **Prüfung** (`node tools/hd-test.mjs <spiel> <out>`): Im Stand ist die Mitte des Breitbilds **pixelgleich** mit dem Originalbild (0,00 % Abweichung); beim Laufen liegt der Neuaufbau ein Bild vor dem zuletzt angezeigten Original. Komposition ≈ 2 ms je Bild.

## Was das für HD bedeutet

Pro Bild kann der Emulator vor `draw_sprite_list` eine **Szenenbeschreibung** auslesen: Kamera, Level-Karte, Kachelgrafik und Sprite-Liste mit Bildnummern. Ein WebGL-Renderer kann daraus

- das Level selbst aufbauen, in beliebiger Breite (Breitbild: links/rechts mehr vom Level),
- Sprites als Texturen zeichnen (einmal je Bildnummer aus dem kompilierten Code in einen Puffer „rendern“ lassen und als Bild cachen),
- zwischen zwei Spielbildern interpolieren,
- jede Kachel und jedes Sprite durch eine hochauflösende Fassung ersetzen (HD-Paket, lokal aus der eigenen PCKELL.DAT erzeugt, z. B. mit Real-ESRGAN).

Offen: Effekt-Flags (Aufblitzen `0x100`), Vordergrund-Kacheln (Sprites hinter Kacheln?), weitere Level und Figuren prüfen, Interpolation zwischen Bildern, HD-Grafikpaket.
