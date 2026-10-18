# Projektinhalt: Kellogg's Land HD

## Ziel
Browser-Recomp von *Tony & Friends in Kellogg's Land* (DOS 1994) nach dem Vorbild von Stunts HD: originale START.EXE nach JavaScript übersetzen, auf emuliertem PC ausführen, Bild in HD per WebGL neu zeichnen.

## Entscheidungen
- 18.10.2026: GitHub-Aktionen ab jetzt über den GitHub-MCP (Davids Wunsch).
- 17.10.2026: Ansatz **echter Recomp** (nicht Engine-Nachbau).
- 18.10.2026: Kellogg's Land HD bleibt eigenständig; Recompiler darf auf Stunts HD aufbauen (Nennung Pflicht).
- 18.10.2026: Commits über GitHub-Noreply-Adresse (E-Mail-Datenschutz im Konto aktiv).
- 17.10.2026: Repo unter `github.com/brummilab/kelloggs-land-hd`, Branch `main` (anfangs privat, seit 18.10.2026 öffentlich).
- Keine Spieldaten im Repo, Spieler bringt eigene Kopie mit (Ordner `game/`, in `.gitignore`).
- Code von movAX13h wird nicht übernommen (keine Lizenz), nur als Referenz genutzt.

## Stand
- Online spielbar: https://brummilab.github.io/kelloggs-land-hd/
- Phase 0 (Analyse) erledigt: START.EXE ist NE / Borland Pascal 7 (RTM/DPMI), 5 Code-Segmente, ~100 KB Code, 16 Importe.
- Phase 1+2 erledigt (18.10.2026): NE-Loader, x86-Interpreter (inkl. 386), emulierter PC (DOS, DPMI, KERNEL/RTM, PIT, PIC, Tastatur, VGA). Das Spiel läuft in Node bis ins Hauptmenü, Tasten funktionieren.
- Phase 3 erledigt (18.10.2026): Browser-Version, spielbar bis ins erste Level. Zeilengenaue VGA (Statusleiste per Line Compare, Palettenwechsel per PEL-Maske). Veröffentlicht als privates Artifact „Kellogg's Land HD“ (claude.ai), dort mit eigener Spielkopie spielbar.
- Phase 5 erledigt (18.10.2026): Ton über nachgebauten Sound Blaster + DMA, Ausgabe per AudioWorklet. Artifact aktualisiert (Version 2).
- Nächster Schritt: Breitbild ausbauen (weitere Level prüfen, Interpolation, WebGL/HD-Grafik) oder Recompiler (docs/RECOMPILER.md).

## Quellen
- Spielbare Seite (privat): https://claude.ai/artifact/XAsjYuLRbLjyDng1jo8pXL
- Vorbild: https://github.com/mr-finster/stunts-hd
- Formate/Spieldateien: https://github.com/movAX13h/tony-and-friends-in-kelloggs-land
- DOSBox-Einstellungen: VOGONS-Thread t=96210

## Log
- 18.10.2026: GitHub-About gesetzt (Beschreibung + 10 Topics). GitHub Pages eingerichtet (Quelle: GitHub Actions, Workflow pages.yml veröffentlicht web/): https://brummilab.github.io/kelloggs-land-hd/
- 18.10.2026: David hat Breitbild getestet: läuft gut.
- 18.10.2026: Breitbild-Prototyp fertig: Level in 16:9 aus Karte/Kacheln/Sprites neu aufgebaut, Mitte im Stand pixelgleich mit dem Original, ~2 ms/Bild. Im Browser per „Breitbild“-Knopf (nur deutsche Version 147 200 Bytes). Artifact aktualisiert.
- 18.10.2026: mr-finster antwortet (Issue #19): nimmt Kellogg's Land nicht in Stunts HD auf, erlaubt aber Nutzung von translate.js & Co. (MIT, mit Nennung). Übersetzer analysiert → docs/RECOMPILER.md: Muster übertragbar, Dekoder/Speichermodell nicht (386, Protected Mode). Vorschlag: blockweise Übersetzung zur Laufzeit.
- 18.10.2026: Reverse Engineering der Grafik: REA (morluto/rea) installiert, kann NE nicht laden → Ghidra 11.3.1 headless direkt. Zeichenpipeline, Kamera, Level-Karte, Kachelformat, Sprite-Liste und kompilierte BOB-Sprites gefunden (docs/GRAFIK.md, docs/map.json). Grundlage für den HD-Renderer.
- 18.10.2026: Issue #19 bei mr-finster/stunts-hd erstellt (Anfrage zur Zusammenarbeit): https://github.com/mr-finster/stunts-hd/issues/19
- 18.10.2026: Davids Test: läuft mit 61–63 fps bei 66–69 % CPU. Knacksen am Anfang und zwischen Szenen behoben (Spiel löscht Puffer mit 00h). Frage an mr-finster (Stunts HD) zur Zusammenarbeit vorbereitet.
- 18.10.2026: Davids ZIP (deutsche DOS-Version, START.EXE 147 200 Bytes, neuer als die Entwicklungskopie) getestet: läuft im Emulator und über die Webseite inkl. Ton bis ins Level. Tastenbelegung laut READ.ME korrigiert (Leertaste/↑ springen, Alt Sonderfunktion, P Pause, Esc Karte).
- 18.10.2026: Phase 5: Sound Blaster/DMA emuliert. Zwei Fallen gefunden: INI braucht ADR= in Großbuchstaben, Treiber braucht wiederverwendbaren DOS-Speicher für den 64-KB-ausgerichteten DMA-Puffer. Musik und Effekte laufen.
- 18.10.2026: Phase 3: Browser-Version (Worker, Canvas, Tastatur, ZIP-Import), zeilengenaue VGA, erstes Level spielbar (laufen, springen mit Strg, Flakes sammeln). Artifact veröffentlicht.
- 18.10.2026: Repo auf GitHub angelegt (privat), erster Push. Phase 1: Spiel zeigt Factor-5-Logo, Kellogg's-Intro, Titelbild (360×480 Mode X) und Hauptmenü. Erkenntnisse in docs/ANALYSE.md.
- 17.10.2026: Recherche (keine bestehenden Recomps/Decomps), Repo-Gerüst, `tools/neinfo.py`, `docs/ANALYSE.md`.
