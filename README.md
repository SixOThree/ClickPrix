# ClickPrix

Hear how close F1 qualifying really was. ClickPrix loads the latest qualifying
results and plays one sound per driver, spaced by their real gap on track — in
real time, the whole field arrives within a few seconds. Styled as a dark
broadcast-style timing tower.

**Live site:** https://sixothree.github.io/ClickPrix/ (sound required — turn it up)

## Run locally

From the repo root:

```powershell
dotnet run --project ClickPrix
```

Then open the URL it prints (typically http://localhost:5204).

## Data sources

Two interchangeable APIs, switchable via the toggle in the footer:

- **OpenF1** (`https://api.openf1.org/v1`) — the default. Publishes session
  results within minutes of the checkered flag, so it is the freshest option
  on a race weekend. The client finds the newest completed qualifying via
  `sessions` → `session_result` (per-driver `[Q1, Q2, Q3]` lap times) joined
  with `drivers` (code, team, team color) and `meetings` (race name). If the
  newest session has no published results yet it steps back up to three
  sessions, and falls back to the previous year in early season.
- **Jolpica** (`https://api.jolpi.ca/ergast/f1`, the Ergast successor) —
  slower to update but the long-standing community source. Because
  `current/last` points at the last completed *race*, the client also probes
  the next round in case qualifying for the upcoming race already happened
  (Saturday-evening scenario).

Both map into one source-agnostic model, so the rest of the app doesn't care
which API supplied the data. Results are cached per source (failures are not,
so a source that was down gets retried). If the chosen source fails, the other
is tried automatically; if both fail, a baked-in dataset is shown and the
footer flips from "LIVE" to "ILLUSTRATIVE TIMING DATA".

## Features

- **Real-time playback** — every sound lands exactly its real gap after pole,
  scheduled sample-accurately on the Web Audio clock (see below). A short
  lead-in runs before the pole crossing.
- **Best / Q1 / Q2 / Q3 session toggle** — rebuilds the field from that
  session's laps, sorted with gaps to that session's pole. "Best" is each
  driver's fastest across all three. Drivers with no time in a session are
  excluded. (Disabled on the offline fallback data, which only has best-lap
  gaps.)
- **Two chart views:**
  - **Markers** — one track lane per driver with a checkered finish line and a
    pill marker in the driver's team color. All markers share one velocity, so
    their spacing on screen encodes the real gaps; each marker hits the line
    exactly on its crossing time, flashes, and coasts past. The crossing sound
    is a car pass-by sample whose *peak* is aligned to the crossing moment —
    you hear each car approach and it's loudest exactly at the line. Samples
    play full-length so consecutive cars mix and overlap like a real field
    (a master-bus compressor keeps up to ~11 simultaneous voices clean).
  - **Highlight** — lane-less timing-tower rows that flash and stay lit as
    each car crosses, with a punchy pop sound, pitch descending down the
    order.
- **Stereo pan across the grid** — P1 arrives on the left, the last car on the
  right.
- **Latest-crossing readout** — position, driver code, and gap to pole update
  live during a run, with a progress bar over the whole field.
- **Team identity** — short team names (long API names are aliased), row
  colors from a hand-picked livery palette, falling back to the API's own team
  color for unknown teams, then grey.
- **Resilient audio** — the two sounds are bundled MP3 samples (Pixabay
  Content License, no attribution required) with leading silence trimmed at
  decode time so transients land exactly on schedule. If a sample fails to
  load, that run falls back to a synthesized tick and the next play retries.
- **Cache busting** — the audio module URL carries a per-build version and
  sample fetches revalidate with the server, so deploys never serve stale
  sounds.

## How the timing works

`ClickPrix/wwwroot/js/audioClicks.js` schedules every sound on the Web Audio
API clock (`AudioContext.currentTime`), which is sample-accurate. C# timers or
`setTimeout` would jitter by 5–15 ms — bigger than many real F1 gaps — while
Web Audio scheduling reproduces a 0.002 s gap faithfully. Markers animate via
the Web Animations API; row flashes and the readout use `setTimeout`, since
visuals don't need sample accuracy.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy-pages.yml`, which
publishes the Blazor WASM app to GitHub Pages (rewrites the base href for the
project path and adds `.nojekyll` so the `_framework` folder survives).

## Project layout

```
ClickPrix.slnx                         Solution file (XML .slnx format)
ClickPrix/Models/QualifyingData.cs     Source-agnostic model the page renders
ClickPrix/Models/JolpicaModels.cs      DTOs for the Ergast-style JSON
ClickPrix/Models/OpenF1Models.cs       DTOs for the OpenF1 JSON
ClickPrix/Services/OpenF1Client.cs     OpenF1 client (default source)
ClickPrix/Services/JolpicaClient.cs    Jolpica client + lap time parsing
ClickPrix/Pages/Home.razor             The whole page: data, toggles, chart, playback
ClickPrix/wwwroot/js/audioClicks.js    Web Audio scheduler + marker animator (ES module)
ClickPrix/wwwroot/audio/               Bundled crossing sounds (vroom + pop)
.github/workflows/deploy-pages.yml     GitHub Pages deployment
```
