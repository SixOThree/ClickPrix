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

1. Two interchangeable data sources, both returning the source-agnostic `QualiData`/`QualiDriver` model (`Models/QualifyingData.cs`); a footer toggle picks one, and if the chosen source fails the other is tried before the static fallback grid:
   - `ClickPrix/Services/OpenF1Client.cs` (default) — OpenF1 API (`https://api.openf1.org/v1`, snake_case JSON). Publishes results within minutes of a session, much sooner than Ergast-lineage sources. Flow: `sessions?session_name=Qualifying&year=` → newest non-cancelled past session (stepping back up to 3 if results aren't out yet, falling back to the previous year in early season) → `session_result` (`duration` = `[Q1,Q2,Q3]` seconds) joined with `drivers` (acronym, team, `team_colour`) → `meetings` for the race name.
   - `ClickPrix/Services/JolpicaClient.cs` — Jolpica F1 API (Ergast successor, `https://api.jolpi.ca/ergast/f1`). Quirk it exists to handle: the API's `current/last` points at the last completed *race*, so on a post-qualifying/pre-race weekend the freshest qualifying belongs to the next round — `GetLatestQualifyingAsync` probes `round + 1` and prefers it if it has results. `ParseTime` converts Ergast time strings (`"1:44.361"`) to seconds.
2. `ClickPrix/Models/JolpicaModels.cs` / `Models/OpenF1Models.cs` — DTOs mirroring each API's JSON. Team names from both APIs are shortened for display via `TeamAliases` in Home.razor; row colors prefer the hand-picked `TeamColors` palette, then OpenF1's `team_colour`, then grey.
3. `ClickPrix/Pages/Home.razor` — the entire UI, styled as a dark timing-tower dashboard (styles in `wwwroot/css/app.css`, fonts from Google Fonts in `index.html`). A Best/Q1/Q2/Q3 toggle picks the session ("Best" = each driver's fastest across sessions); entries are sorted and expressed as gaps to that session's pole, and drivers with no time in the session are excluded. If the API returns nothing, a static fallback grid baked into the page is used, the footer flips from "LIVE TIMING DATA" to "ILLUSTRATIVE TIMING DATA", and the session pills are disabled (the fallback data only has best-lap gaps). Playback is always real time. A Markers/Highlight toggle picks the visual: animated per-driver track lanes with a checkered finish line, or lane-less rows that light up as each car crosses. C# computes all timing geometry and passes it to JS; it imports `wwwroot/js/audioClicks.js` as an ES module via JS interop and passes a `DotNetObjectReference` so JS can call back `OnPlaybackFinished`.
4. `ClickPrix/wwwroot/js/audioClicks.js` — Web Audio scheduler plus the visual driver (Web Animations API for markers/progress, `setTimeout` for row flashes and the readout). Sounds are samples from `wwwroot/audio/` (Markers: car pass-by at natural pitch, full length so the field overlaps; Highlight: punchy pop, pitch descending down the order), loaded lazily with leading-silence trimmed so transients land exactly on the scheduled crossing; a failed sample load falls back to a synthesized square-wave tick for that run and retries on the next play. Everything routes through a master gain + compressor (overlapping vrooms would clip a bare destination).

### Timing constraint (the core design decision)

Click timing must stay on the Web Audio clock (`AudioContext.currentTime` scheduling in `audioClicks.js`). C# timers or `setTimeout` jitter by 5–15 ms, which is larger than many real F1 gaps (down to ~0.002 s). Row highlighting deliberately uses `setTimeout` because visuals don't need sample accuracy. Do not move playback timing into C# or timeout-based scheduling.

`ensureContext()` in `audioClicks.js` contains two non-obvious workarounds — keep them if touching audio code:
- A looping keep-alive buffer holds the output chain awake; without it the first (pole) click gets swallowed on Windows (silence-gated power saving, notably Bluetooth headsets). It must carry *non-zero* samples — silence detectors act on sample content, so an all-zero loop does not prevent the sleep. It uses a 30 Hz sine at −60 dBFS: inaudible, but real signal.
- After `resume()`, it waits until `currentTime` actually starts ticking before scheduling, since a frozen-then-jumping clock shifts or clips the earliest clicks.
