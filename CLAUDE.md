# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ClickPrix: a standalone Blazor WebAssembly (.NET 8) app that plays one audio click per F1 driver, spaced by their real qualifying gaps, so you can hear how close qualifying was. There is no test project.

## Commands

From the repo root:

```powershell
dotnet run --project ClickPrix   # serves via the Blazor dev server; http profile uses http://localhost:5204
dotnet build                      # builds ClickPrix.slnx
```

## Architecture

`ClickPrix.slnx` (XML solution format, needs SDK 9.0.200+/VS 17.13+) at the root references the single project in `ClickPrix/` (root namespace `ClickPrix`). The whole app is one data pipeline:

1. `ClickPrix/Services/JolpicaClient.cs` fetches qualifying results from the Jolpica F1 API (Ergast successor, `https://api.jolpi.ca/ergast/f1`). Quirk it exists to handle: the API's `current/last` points at the last completed *race*, so on a post-qualifying/pre-race weekend the freshest qualifying belongs to the next round — `GetLatestQualifyingAsync` probes `round + 1` and prefers it if it has results. `ParseTime` converts Ergast time strings (`"1:44.361"`) to seconds.
2. `ClickPrix/Models/JolpicaModels.cs` — DTOs mirroring the Ergast-style JSON (all-string fields, nested `MRData.RaceTable.Races`).
3. `ClickPrix/Pages/Home.razor` — the entire UI, styled as a dark timing-tower dashboard (styles in `wwwroot/css/app.css`, fonts from Google Fonts in `index.html`). Entries are each driver's best time across Q1–Q3, sorted, expressed as gaps to pole. If the API returns nothing, a static fallback grid baked into the page is used and the footer flips from "LIVE TIMING DATA" to "ILLUSTRATIVE TIMING DATA". Playback is always real time. A Markers/Highlight toggle picks the visual: animated per-driver track lanes with a checkered finish line, or lane-less rows that light up as each car crosses. C# computes all timing geometry and passes it to JS; it imports `wwwroot/js/audioClicks.js` as an ES module via JS interop and passes a `DotNetObjectReference` so JS can call back `OnPlaybackFinished`.
4. `ClickPrix/wwwroot/js/audioClicks.js` — Web Audio click scheduler (square osc → highpass → envelope → stereo pan, pitch descending down the order) plus the visual driver: Web Animations API for markers/progress, `setTimeout` for row flashes and the readout.

### Timing constraint (the core design decision)

Click timing must stay on the Web Audio clock (`AudioContext.currentTime` scheduling in `audioClicks.js`). C# timers or `setTimeout` jitter by 5–15 ms, which is larger than many real F1 gaps (down to ~0.002 s). Row highlighting deliberately uses `setTimeout` because visuals don't need sample accuracy. Do not move playback timing into C# or timeout-based scheduling.

`ensureContext()` in `audioClicks.js` contains two non-obvious workarounds — keep them if touching audio code:
- A looping keep-alive buffer holds the output chain awake; without it the first (pole) click gets swallowed on Windows (silence-gated power saving, notably Bluetooth headsets). It must carry *non-zero* samples — silence detectors act on sample content, so an all-zero loop does not prevent the sleep. It uses a 30 Hz sine at −60 dBFS: inaudible, but real signal.
- After `resume()`, it waits until `currentTime` actually starts ticking before scheduling, since a frozen-then-jumping clock shifts or clips the earliest clicks.
