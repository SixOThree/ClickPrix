namespace ClickPrix.Models;

// DTOs for https://api.openf1.org/v1 (snake_case JSON; deserialized with
// JsonNamingPolicy.SnakeCaseLower).

public class OpenF1Session
{
    public int SessionKey { get; set; }
    public int MeetingKey { get; set; }
    public DateTimeOffset DateStart { get; set; }
    public bool IsCancelled { get; set; }
}

public class OpenF1Meeting
{
    public string? MeetingName { get; set; }
    public int Year { get; set; }
}

public class OpenF1Result
{
    public int DriverNumber { get; set; }
    public bool Dns { get; set; }
    public bool Dsq { get; set; }

    /// <summary>For qualifying: [Q1, Q2, Q3] lap times in seconds, null where no time was set.</summary>
    public double?[]? Duration { get; set; }
}

public class OpenF1Driver
{
    public int DriverNumber { get; set; }
    public string? NameAcronym { get; set; }
    public string? TeamName { get; set; }
    public string? TeamColour { get; set; }
}
