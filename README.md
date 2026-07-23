# ClickPrix

Hear how close F1 qualifying really was. The page loads the latest qualifying
results from the Jolpica F1 API (the Ergast successor), then plays one click
per driver, spaced by their real gap on track. A 1 second preset delay runs
before the first (pole) click, which has a lower pitch so you can anchor on it.

## Run

From the repo root:

```powershell
dotnet run --project ClickPrix
```

Then open the URL it prints (typically http://localhost:5204).

## How it works

- **Data**: `ClickPrix/Services/JolpicaClient.cs` fetches `https://api.jolpi.ca/ergast/f1/current/last/qualifying.json`.
  Because "last" means the last completed *race*, it also probes the next round
  in case qualifying for the upcoming race has already happened (Saturday
  evening scenario).
- **Sessions**: The Best / Q1 / Q2 / Q3 toggle rebuilds the list from that
  session's times. "Best" is each driver's fastest lap across all sessions.
- **Audio**: `ClickPrix/wwwroot/js/audioClicks.js` schedules clicks on the Web Audio API
  clock (`AudioContext.currentTime`), which is sample-accurate. C# timers or
  `setTimeout` would jitter by 5-15 ms, which is bigger than many F1 gaps;
  Web Audio scheduling reproduces a 0.002 s gap faithfully.
- **UI**: Blazor WebAssembly (standalone, .NET 8). Rows highlight as their
  click plays (via `setTimeout`, since visuals do not need sample accuracy).

## Project layout

```
ClickPrix.slnx                        Solution file (XML .slnx format)
ClickPrix/Models/JolpicaModels.cs     DTOs for the Ergast-style JSON
ClickPrix/Services/JolpicaClient.cs   API client + lap time parsing
ClickPrix/Pages/Home.razor            The whole page: fetch, toggle, table, play button
ClickPrix/wwwroot/js/audioClicks.js   Web Audio click scheduler (ES module)
```
