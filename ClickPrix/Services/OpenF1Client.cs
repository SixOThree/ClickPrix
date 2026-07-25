using System.Net.Http.Json;
using System.Text.Json;
using ClickPrix.Models;

namespace ClickPrix.Services;

/// <summary>
/// Qualifying results from the OpenF1 API (https://openf1.org). OpenF1
/// publishes session results within minutes of the checkered flag - much
/// sooner than the Ergast-lineage sources - so it is the fresher option on
/// a race weekend.
/// </summary>
public class OpenF1Client
{
    private readonly HttpClient _http;
    private const string BaseUrl = "https://api.openf1.org/v1";

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true,
    };

    public OpenF1Client(HttpClient http) => _http = http;

    /// <summary>Most recent qualifying session that already has published results.</summary>
    public async Task<QualiData?> GetLatestQualifyingAsync(CancellationToken cancellationToken = default)
    {
        var year = DateTimeOffset.UtcNow.Year;
        var candidates = await GetCompletedSessionsAsync(year, cancellationToken);
        if (candidates.Count == 0)
        {
            candidates = await GetCompletedSessionsAsync(year - 1, cancellationToken); // early season
        }

        // The newest completed session may not have results published yet
        // (or was rained into oblivion) - step back a couple if needed.
        foreach (var session in candidates.Take(3))
        {
            var data = await BuildFromSessionAsync(session, cancellationToken);
            if (data is not null)
            {
                return data;
            }
        }

        return null;
    }

    private async Task<List<OpenF1Session>> GetCompletedSessionsAsync(int year, CancellationToken cancellationToken)
    {
        var sessions = await Get<List<OpenF1Session>>($"sessions?session_name=Qualifying&year={year}", cancellationToken) ?? new();
        return sessions
            .Where(s => !s.IsCancelled && s.DateStart <= DateTimeOffset.UtcNow)
            .OrderByDescending(s => s.DateStart)
            .ToList();
    }

    private async Task<QualiData?> BuildFromSessionAsync(OpenF1Session session, CancellationToken cancellationToken)
    {
        var results = await Get<List<OpenF1Result>>($"session_result?session_key={session.SessionKey}", cancellationToken);
        if (results is null || results.Count == 0)
        {
            return null;
        }

        var drivers = await Get<List<OpenF1Driver>>($"drivers?session_key={session.SessionKey}", cancellationToken) ?? new();
        var byNumber = drivers
            .GroupBy(d => d.DriverNumber)
            .ToDictionary(g => g.Key, g => g.First());

        var entries = new List<QualiDriver>();
        foreach (var r in results.Where(r => !r.Dns && !r.Dsq))
        {
            byNumber.TryGetValue(r.DriverNumber, out var d);
            var q = r.Duration ?? Array.Empty<double?>();
            entries.Add(new QualiDriver(
                d?.NameAcronym ?? $"#{r.DriverNumber}",
                d?.TeamName ?? "",
                d?.TeamColour is { Length: > 0 } colour ? "#" + colour : null,
                q.ElementAtOrDefault(0),
                q.ElementAtOrDefault(1),
                q.ElementAtOrDefault(2)));
        }

        if (entries.Count == 0)
        {
            return null;
        }

        var meeting = (await Get<List<OpenF1Meeting>>($"meetings?meeting_key={session.MeetingKey}", cancellationToken))?.FirstOrDefault();
        var title = meeting?.MeetingName is { Length: > 0 } name
            ? $"{name} {(meeting.Year > 0 ? meeting.Year : session.DateStart.Year)} · Qualifying"
            : $"Qualifying · {session.DateStart:yyyy-MM-dd}";

        return new QualiData(title, entries);
    }

    private async Task<T?> Get<T>(string path, CancellationToken cancellationToken) where T : class
    {
        try
        {
            return await _http.GetFromJsonAsync<T>($"{BaseUrl}/{path}", JsonOpts, cancellationToken);
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
}
