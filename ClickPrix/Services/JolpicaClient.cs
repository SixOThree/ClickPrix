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
    public async Task<Race?> GetLatestQualifyingAsync()
    {
        var last = await GetQualifyingAsync("current/last");
        if (last is null)
            return null;

        // Try the round after the last completed race (post-qualifying, pre-race window)
        if (int.TryParse(last.Round, out var round))
        {
            var next = await GetQualifyingAsync($"{last.Season}/{round + 1}");
            if (next is not null && next.QualifyingResults.Count > 0)
                return next;
        }

        return last;
    }

    private async Task<Race?> GetQualifyingAsync(string racePath)
    {
        try
        {
            var resp = await _http.GetFromJsonAsync<QualifyingResponse>(
                $"{BaseUrl}/{racePath}/qualifying.json?limit=100", JsonOpts);
            return resp?.MRData?.RaceTable?.Races.FirstOrDefault();
        }
        catch
        {
            return null;
        }
    }

    /// <summary>Parses an Ergast-style time string ("1:44.361" or "59.876") into seconds.</summary>
    public static double? ParseTime(string? time)
    {
        if (string.IsNullOrWhiteSpace(time))
            return null;

        var parts = time.Split(':');
        try
        {
            return parts.Length switch
            {
                1 => double.Parse(parts[0], System.Globalization.CultureInfo.InvariantCulture),
                2 => int.Parse(parts[0]) * 60 + double.Parse(parts[1], System.Globalization.CultureInfo.InvariantCulture),
                _ => null
            };
        }
        catch
        {
            return null;
        }
    }
}
