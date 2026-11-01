# Graphics strategy for the village

Status: recommendation for the CEO's decision. Nothing here is built yet.

## Why the current art is weak

The sprites and tiles are drawn by code (`tools/map/src`), pixel by pixel, by a model that cannot see what it is drawing. That ceiling is low: shapes are blocky, there is no shading discipline, and every change means editing code. Better art needs three things the code does not have: a **style definition**, a **real art source**, and a **pipeline** that loads finished images instead of drawing them.

## Recommendation: three steps

### Step 1. Separate art from code (small, do first)

Make the map load images from an `assets/` folder described by data, and stop drawing in code.

- `tools/map/assets/atlas.png` plus `atlas.json` (frame names, sizes, anchor points, animation frames).
- One naming scheme: `char/<name>/<state>_<dir>_<frame>` and `building/<name>/<state>`.
- Fallback: if a frame is missing, draw the current code art, so the map never breaks while art arrives piece by piece.
- Assets are PNG with transparent background, integer-scaled in the browser (`image-rendering: pixelated`), so art is crisp at any window size.

This is the step that makes every later art change a file swap, not a code change. About a day of work.

### Step 2. Lock a style on one vertical slice

Do not produce the whole village first. Produce one building (Cain's tower) and one character (Cain: idle, working, blocked, 4 directions) and judge them.

An **art bible** (`docs/ART-BIBLE.md`, one page) fixes: canvas and tile size (suggest a 64×32 isometric tile), a fixed palette of 24 to 32 colours, light from the top left, a 1 px darker outline rule, character height of 2 tiles, and the five or so states each character shows (idle, walking, working, waiting for the CEO, blocked). It is the contract every asset obeys, the same way an API contract does for the code.

### Step 3. Choose the art source, then scale

| Source | Quality | Cost | Control | Notes |
|---|---|---|---|---|
| **A. Commissioned pixel artist** | Highest, consistent | $300 to $1,500 for the full set | Highest | Best if the village is the product's face. Needs a brief: the art bible plus character sheets. |
| **B. Licensed asset packs** (itch.io, Kenney, etc.) | Good, consistent per pack | $0 to $60 | Low: you get what the pack has | Fastest. Check the licence permits your use. Characters will not be Cain or Wirt specifically, but can be recoloured and renamed. |
| **C. AI image generation, cleaned by hand** | Variable; consistency across frames is the hard part | Tool subscription plus your time | Medium | Works for concepts and for static buildings; animated multi-direction characters usually need heavy cleanup in a pixel editor (Aseprite, Pixelorama). |
| **D. Keep generating in code** | Lowest | Tokens | Highest | The current state. |

**Suggested path: B for the fast first version, A for the final.**

1. Do step 1 now.
2. Pick one pack that matches the "Tristram" mood (gothic village, dark fantasy, isometric) and wire it in, so the map is good within days.
3. Use the slice (step 2) as the brief for a commissioned artist, with the existing agent charters as character descriptions. Replace pack art file by file as the commissioned art arrives. The pipeline from step 1 makes each replacement a file swap.
4. Use AI generation for mood boards and variations only, not for production frames, unless you are happy to clean them by hand.

## What good looks like (acceptance for the graphics work)

- Every building and character is one image set, not code.
- Each of the seven characters is recognisable at 2× zoom without a label.
- Active, waiting, blocked and absent states are visible without reading text.
- Portal colours (blue, gold, red, grey) stay exactly as in SPEC 17.3.
- The map still works with art missing (fallback) and still passes `tools/tests/map.test.mjs`.
- One screenshot per cycle can be taken in headless Edge for review.

## Decisions I need from you

1. **Source:** B then A (recommended), A only, or something else?
2. **Mood:** gothic dark fantasy (Diablo-like) or a lighter cosy village? It changes the palette and the pack choice.
3. **Budget** for art, if any, and whether you will commission or I should draft the artist brief.
4. **Where do I look for packs?** You can pick, or I can shortlist three that fit the mood and licence.
