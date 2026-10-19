# Roadmap

Where Kellogg's Land HD stands and what comes next. ✅ done · 🔨 in progress · ⬜ planned

## Phase 0–3: Running the game ✅

- ✅ Analyse `START.EXE` (NE, Borland Pascal 7, RTM/DPMI16, 386 code)
- ✅ NE loader, x86 interpreter with 386 extensions, emulated PC (DOS, DPMI, KERNEL/RTM, PIC, PIT, keyboard)
- ✅ VGA: planar modes, Mode X, beam-synchronous drawing (status bar via line compare, mid-frame PEL mask palette split)
- ✅ Browser version: Web Worker, ZIP/folder import, keyboard, high scores saved in the browser
- ✅ Published on GitHub Pages

## Phase 5: Sound ✅

- ✅ Sound Blaster DSP 2.01 and 8237 DMA, timed to the virtual clock
- ✅ AudioWorklet output, volume control
- ✅ Click suppression at start and between scenes

## Phase 6: Widescreen and HD 🔨

- ✅ Read the scene every frame (camera, level map, tiles, sprite list)
- ✅ Rebuild levels in 16:9 from map and tiles; centre pixel-identical to the original
- ✅ Capture sprites from their compiled draw code
- ✅ Sprites in the side margins before they were ever on screen (rendered off-screen through the game's own draw routine, verified pixel-identical)
- ✅ Flash/hit effect (sprite flag `0x100`) drawn as a colour-FFh silhouette, like the game's set/reset trick
- ✅ Info windows and pause: centre taken from the original picture while the game loop stands still
- ⬜ Check the flash effect and other special draw modes in actual play
- ⬜ Foreground tiles and draw order checks
- ⬜ Verify all levels and worlds, boss fights, bonus stages
- ⬜ Profiles for other game releases (e.g. START.EXE 148,480 bytes)
- ✅ WebGL2 renderer (palette, PEL mask, tiles and sprites on the GPU; software fallback)
- 🔨 Frame interpolation for smoother scrolling (camera and sprites, at the monitor's refresh rate; needs testing on real hardware)
- ✅ HD mode: sharp-bilinear pixels for the playfield, xBR-lv2 for status bar and info windows (toggle "Grafik: HD / Pixel")
- ⬜ More scaler choices (ScaleFX, sharp bilinear, CRT look)
- ✅ Graphics workshop: export tiles and sprites, load hand-made HD packs (4×, recoloured for fades, water and flashes)
- 🚧 Hand-drawn HD art for level 1 (Tony, key tiles) as a first HD pack — done so far: question-mark block, door, leaf row, stone pillars and walls, windows, roof, house wall, ground, grass strip, climbing-plant wall, bridge, cloud, big tree, stone gate, cornflakes (foliage of the climbing-plant wall and the tree crown redrawn in the style of the leaf row)
- ⬜ Export of all sprite frames without having seen them in play; animated tiles; menus and status bar replaceable

## Phase 4: Recompiler ⬜

Plan in [docs/RECOMPILER.md](docs/RECOMPILER.md) (German).

- ⬜ Block translation at runtime: decode basic blocks, generate JavaScript, cache per selector:offset
- ⬜ Lazy flags, fast memory path, VGA and ports through the existing emulation
- ⬜ Interrupt points at block boundaries to keep raster timing
- ⬜ Test mode: interpreter and translated code must produce identical frames and registers
- ⬜ Goal: 3–8× faster than the interpreter, lower CPU load on laptops and phones

## Phase 7: Polish ⬜

- ⬜ Touch controls and gamepad support
- ⬜ Remappable keys
- ⬜ Save states
- ⬜ Settings menu (scaling, widescreen, volume) remembered per browser
- ⬜ Offline use (installable web app)
- ⬜ English UI alongside German
