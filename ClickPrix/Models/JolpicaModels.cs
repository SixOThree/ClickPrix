namespace ClickPrix.Models;

public class QualifyingResponse
{
    public MRData? MRData { get; set; }
}

public class MRData
{
    public RaceTable? RaceTable { get; set; }
}

public class RaceTable
{
    public string? Season { get; set; }
    public string? Round { get; set; }
    public List<Race> Races { get; set; } = new();
}

public class Race
{
    public string? Season { get; set; }
    public string? Round { get; set; }
    public string? RaceName { get; set; }
    public string? Date { get; set; }
    public List<QualifyingResult> QualifyingResults { get; set; } = new();
}

public class QualifyingResult
{
    public string? Number { get; set; }
    public string? Position { get; set; }
    public Driver? Driver { get; set; }
    public Constructor? Constructor { get; set; }
    public string? Q1 { get; set; }
    public string? Q2 { get; set; }
    public string? Q3 { get; set; }
}

public class Driver
{
    public string? DriverId { get; set; }
    public string? Code { get; set; }
    public string? GivenName { get; set; }
    public string? FamilyName { get; set; }
}

public class Constructor
{
    public string? ConstructorId { get; set; }
    public string? Name { get; set; }
}
