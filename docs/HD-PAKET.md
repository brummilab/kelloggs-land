# Eigene HD-Grafik (Grafik-Werkstatt)

Stand: 18.10.2026. Mit der Grafik-Werkstatt lassen sich Kacheln und Figuren des Spiels von Hand verbessern. Das Ergebnis heißt **HD-Paket**: ein Ordner oder eine ZIP-Datei mit PNG-Bildern, die die Originalgrafik im Spiel ersetzen.

Die Grafiken stammen immer aus der eigenen Spielkopie. Ein HD-Paket enthält bearbeitete Spielgrafik und gehört deshalb **nicht** ins Repository und nicht ins Netz, solange die Rechte nicht geklärt sind.

## Ablauf

1. Spiel im Browser starten (Version mit START.EXE 147 200 Bytes) und ins Level gehen.
2. Unter dem Bild „Grafik-Werkstatt“ öffnen → **Grafik exportieren**. Es kommt `kelloggs-grafik.zip`:

   | Ordner/Datei | Inhalt |
   |---|---|
   | `original/kacheln/t_<kennung>.png` | alle Kacheln des aktuellen Levels, 16×16 |
   | `original/sprites/s_<kennung>.png` | alle bisher gesehenen Figuren-Bilder, Originalgröße, transparent |
   | `hd-vorlage/…` | dieselben Bilder 4-fach vergrößert (Kachel 64×64): **hier drin zeichnen** |
   | `uebersicht-kacheln.png` | alle Kacheln des Levels auf einem Blatt |
   | `LIESMICH.txt` | Kurzanleitung |

3. Bilder aus `hd-vorlage/` im Grafikprogramm verbessern (Aseprite, Krita, GIMP, Photoshop …). Dateiname und Seitenverhältnis bleiben gleich.
4. Die bearbeiteten Bilder in einen Ordner oder eine ZIP legen → **HD-Paket laden** (bzw. „HD-Ordner laden“). Die Änderung ist sofort im Spiel sichtbar, auch im laufenden Level. Das Paket bleibt im Browser gespeichert (IndexedDB) und wird beim nächsten Start automatisch geladen; „HD-Paket entfernen“ löscht es.

## Regeln für die Bilder

- **Dateiname** `t_xxxxxxxx.png` (Kachel) bzw. `s_xxxxxxxx.png` (Sprite). Die Kennung ist ein Prüfwert über die Original-Pixel. Gleiche Kachel in mehreren Leveln = gleiche Kennung, also nur einmal zeichnen. Ordner im Paket sind egal; `original/` wird beim Laden übersprungen.
- **Größe**: 4-fach (Kachel 64×64, Sprite Breite·4 × Höhe·4). 1-, 2- und 8-fach wird beim Laden umgerechnet.
- **Format**: PNG, RGB/RGBA/Palette/Graustufen, 1–8 Bit. Bei Sprites zählt die Transparenz (Alpha < 50 % = durchsichtig). Die Figur darf innerhalb ihres Rahmens etwas größer oder kleiner werden.
- **Farben** sind frei. Das Spiel färbt HD-Grafik automatisch passend um: beim Einblenden, im Wasser (dort nutzt das Spiel die zweite Palettenhälfte über die PEL-Maske) und beim Aufblitzen nach einem Treffer (weiße Silhouette).
- **Kachelränder**: Kacheln liegen lückenlos nebeneinander. Ränder so zeichnen, dass sie an die Nachbarn passen; `uebersicht-kacheln.png` hilft beim Zusammensuchen.

## Technik

- `web/scene.js`: `gfxHash()` (FNV-1a über die Farbindizes, bei Sprites mit Deckkraft), `exportGfx()` sammelt alle Kacheln der Level-Karte und alle Sprites aus dem Cache, Farben wie im oberen Bildteil (Index & PEL-Maske der ersten Zeile).
- `web/hdpack.js`: Export als ZIP (eigener PNG-Schreiber, Deflate über `CompressionStream`), Import mit eigenem PNG-Leser, Speicherung in IndexedDB.
- `web/gl.js`: Mit Paket zeichnet der Renderer das Spielfeld in 4-facher Auflösung. Kacheln: Grafikindex → Platz im HD-Atlas (Textur `uHDSlot`); Sprites: eigener HD-Atlas. Umfärben: `HD-Farbe × aktuelle Farbe(Index & Maske) / Referenzfarbe(Index)`, Referenz = hellste bisher gesehene Farbe je Index (so wirken Einblenden und Wasser).

## Grenzen

- Nur Sprites, die man im Spiel schon gesehen hat, kommen in den Export: weiterspielen und erneut exportieren.
- Animierte Kacheln (z. B. Cornflakes) erscheinen mit dem Bild, das beim Export gerade angezeigt wird; die anderen Animationsbilder kommen bei weiteren Exporten dazu.
- Menüs, Titelbild, Karte und Statusleiste sind (noch) nicht ersetzbar.
