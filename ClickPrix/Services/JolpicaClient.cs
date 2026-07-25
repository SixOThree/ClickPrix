using System.Globalization;
using System.Net.Http.Json;
using System.Text.Json;
using ClickPrix.Models;

namespace ClickPrix.Services;

public class JolpicaClient
{
    private readonly HttpClient _http;
    private static readonly JsonSerializerOptions JsonOpts = new() { PropertyNameCaseInsensitive = true };
    private const string BaseUrl = "https://api.jolpi.ca/ergast/f1";

    public JolpicaClient(HttpClient http) => _http = http;

    /// <summary>
    /// Gets the most recent qualifying session that has results.
    /// "current/last" points at the last completed RACE, so on a Saturday night
    /// the freshest qualifying may actually belong to the NEXT round. We check.
    /// </summary>
    public async Task<Race?> GetLatestQualifyingAsync(CancellationToken cancellationToken = default)
    {
        var last = await GetQualifyingAsync("current/last", cancellationToken);
        if (last is null)
        {
            return null;
        }

        // Try the round after the last completed race (post-qualifying, pre-race window)
        if (int.TryParse(last.Round, out var round))
        {
            var next = await GetQualifyingAsync($"{last.Season}/{round + 1}", cancellationToken);
            if (next is not null && next.QualifyingResults.Count > 0)
            {
                return next;
            }
        }

        return last;
    }

    private async Task<Race?> GetQualifyingAsync(string racePath, CancellationToken cancellationToken)
    {
        try
        {
            var resp = await _http.GetFromJsonAsync<QualifyingResponse>(
                $"{BaseUrl}/{racePath}/qualifying.json?limit=100", JsonOpts, cancellationToken);
            return resp?.MRData?.RaceTable?.Races.FirstOrDefault();
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw; // real cancellation propagates; HTTP timeouts fall through below
        }
        catch (Exception ex) when (ex is HttpRequestException or JsonException or TaskCanceledException)
        {
            return null;
        }
    }

    /// <summary>Latest qualifying as the source-agnostic model Home renders.</summary>
    public async Task<QualiData?> GetLatestQualifyingDataAsync(CancellationToken cancellationToken = default)
    {
        var race = await GetLatestQualifyingAsync(cancellationToken);
        if (race is null || race.QualifyingResults.Count == 0)
        {
            return null;
        }

        var drivers = race.QualifyingResults.Select(r =>
        {
            var code = r.Driver?.Code;
            if (string.IsNullOrEmpty(code))
            {
                var family = r.Driver?.FamilyName;
                code = string.IsNullOrEmpty(family) ? "???" : family[..Math.Min(3, family.Length)].ToUpperInvariant();
            }

            return new QualiDriver(code, r.Constructor?.Name ?? "", null,
                ParseTime(r.Q1), ParseTime(r.Q2), ParseTime(r.Q3));
        }).ToList();

        return new QualiData($"{race.RaceName} {race.Season} · Qualifying", drivers);
    }

    /// <summary>Parses an Ergast-style time string ("1:44.361" or "59.876") into seconds.</summary>
    public static double? ParseTime(string? time)
    {
        if (string.IsNullOrWhiteSpace(time))
        {
            return null;
        }

        var parts = time.Split(':');
        return parts.Length switch
        {
            1 when double.TryParse(parts[0], NumberStyles.Float, CultureInfo.InvariantCulture, out var secs)
                => secs,
            2 when int.TryParse(parts[0], out var minutes)
                && double.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var secs)
                => minutes * 60 + secs,
            _ => null,
        };
    }
}
