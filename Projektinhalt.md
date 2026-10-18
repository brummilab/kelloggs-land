# Projektinhalt: Kellogg's Land HD

## Ziel
Browser-Recomp von *Tony & Friends in Kellogg's Land* (DOS 1994) nach dem Vorbild von Stunts HD: originale START.EXE nach JavaScript übersetzen, auf emuliertem PC ausführen, Bild in HD per WebGL neu zeichnen.

## Entscheidungen
- 17.10.2026: Ansatz **echter Recomp** (nicht Engine-Nachbau).
- 17.10.2026: Repo **privat** unter `github.com/brummilab/kelloggs-land-hd`, Branch `main`.
- Keine Spieldaten im Repo, Spieler bringt eigene Kopie mit (Ordner `game/`, in `.gitignore`).
- Code von movAX13h wird nicht übernommen (keine Lizenz), nur als Referenz genutzt.

## Stand
- Phase 0 (Analyse) erledigt: START.EXE ist NE / Borland RTM, 5 Code-Segmente, ~100 KB Code, 16 Importe.
- Nächster Schritt: Phase 1, NE-Loader + x86-Interpreter in Node.

## Quellen
- Vorbild: https://github.com/mr-finster/stunts-hd
- Formate/Spieldateien: https://github.com/movAX13h/tony-and-friends-in-kelloggs-land
- DOSBox-Einstellungen: VOGONS-Thread t=96210

## Log
- 17.10.2026: Recherche (keine bestehenden Recomps/Decomps), Repo-Gerüst, `tools/neinfo.py`, `docs/ANALYSE.md`.
