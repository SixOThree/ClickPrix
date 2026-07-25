namespace ClickPrix.Models;

/// <summary>Source-agnostic qualifying result: what Home renders, whichever API supplied it.</summary>
public record QualiData(string Title, IReadOnlyList<QualiDriver> Drivers);

/// <summary>Per-driver session times in seconds (null = no time set in that segment).
/// ApiColor is a source-provided team color (OpenF1), used for teams our palette doesn't know.</summary>
public record QualiDriver(string Code, string Team, string? ApiColor, double? Q1, double? Q2, double? Q3);
