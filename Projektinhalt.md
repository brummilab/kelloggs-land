# Projektinhalt: Kellogg's Land HD

## Ziel
Browser-Recomp von *Tony & Friends in Kellogg's Land* (DOS 1994) nach dem Vorbild von Stunts HD: originale START.EXE nach JavaScript übersetzen, auf emuliertem PC ausführen, Bild in HD per WebGL neu zeichnen.

## Entscheidungen
- 17.10.2026: Ansatz **echter Recomp** (nicht Engine-Nachbau).
- 18.10.2026: Commits über GitHub-Noreply-Adresse (E-Mail-Datenschutz im Konto aktiv).
- 17.10.2026: Repo **privat** unter `github.com/brummilab/kelloggs-land-hd`, Branch `main`.
- Keine Spieldaten im Repo, Spieler bringt eigene Kopie mit (Ordner `game/`, in `.gitignore`).
- Code von movAX13h wird nicht übernommen (keine Lizenz), nur als Referenz genutzt.

## Stand
- Phase 0 (Analyse) erledigt: START.EXE ist NE / Borland Pascal 7 (RTM/DPMI), 5 Code-Segmente, ~100 KB Code, 16 Importe.
- Phase 1+2 erledigt (18.10.2026): NE-Loader, x86-Interpreter (inkl. 386), emulierter PC (DOS, DPMI, KERNEL/RTM, PIT, PIC, Tastatur, VGA). Das Spiel läuft in Node bis ins Hauptmenü, Tasten funktionieren.
- Phase 3 erledigt (18.10.2026): Browser-Version, spielbar bis ins erste Level. Zeilengenaue VGA (Statusleiste per Line Compare, Palettenwechsel per PEL-Maske). Veröffentlicht als privates Artifact „Kellogg's Land HD“ (claude.ai), dort mit eigener Spielkopie spielbar.
- Nächster Schritt: Phase 5 Ton (Sound Blaster) oder Phase 4 Recompiler, je nach Wunsch.

## Quellen
- Spielbare Seite (privat): https://claude.ai/artifact/XAsjYuLRbLjyDng1jo8pXL
- Vorbild: https://github.com/mr-finster/stunts-hd
- Formate/Spieldateien: https://github.com/movAX13h/tony-and-friends-in-kelloggs-land
- DOSBox-Einstellungen: VOGONS-Thread t=96210

## Log
- 18.10.2026: Phase 3: Browser-Version (Worker, Canvas, Tastatur, ZIP-Import), zeilengenaue VGA, erstes Level spielbar (laufen, springen mit Strg, Flakes sammeln). Artifact veröffentlicht.
- 18.10.2026: Repo auf GitHub angelegt (privat), erster Push. Phase 1: Spiel zeigt Factor-5-Logo, Kellogg's-Intro, Titelbild (360×480 Mode X) und Hauptmenü. Erkenntnisse in docs/ANALYSE.md.
- 17.10.2026: Recherche (keine bestehenden Recomps/Decomps), Repo-Gerüst, `tools/neinfo.py`, `docs/ANALYSE.md`.
