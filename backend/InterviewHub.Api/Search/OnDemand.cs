using System.Text.RegularExpressions;

namespace InterviewHub.Api.Search;

/// <summary>Limits for fetching new questions from the internet while a user searches.</summary>
public class OnDemandOptions
{
    public const string Section = "OnDemand";
    public bool Enabled { get; set; } = true;
    /// <summary>Fetch only when fewer than this many stored questions match.</summary>
    public int MinStoredResults { get; set; } = 3;
    public int MaxQuestionsPerSearch { get; set; } = 5;
    /// <summary>Total internet fetches allowed per UTC day, across all users (protects API credits).</summary>
    public int DailyFetchLimit { get; set; } = 25;
    /// <summary>The same topic+phrase is not fetched again within this many hours.</summary>
    public int CooldownHours { get; set; } = 24;
}

public enum GateResult { Allowed, Cooldown, DailyLimit }

/// <summary>Process-wide spend guard for on-demand fetching. Resets on restart.</summary>
public class OnDemandGate
{
    private readonly object _lock = new();
    private readonly Dictionary<string, DateTime> _seen = new();
    private DateOnly _day = DateOnly.FromDateTime(DateTime.UtcNow);
    private int _count;

    public GateResult TryAcquire(string key, OnDemandOptions o)
    {
        lock (_lock)
        {
            var now = DateTime.UtcNow;
            var today = DateOnly.FromDateTime(now);
            if (today != _day) { _day = today; _count = 0; }

            var cutoff = now - TimeSpan.FromHours(o.CooldownHours);
            foreach (var old in _seen.Where(kv => kv.Value < cutoff).Select(kv => kv.Key).ToList())
                _seen.Remove(old);

            if (_seen.ContainsKey(key)) return GateResult.Cooldown;
            if (_count >= o.DailyFetchLimit) return GateResult.DailyLimit;

            _seen[key] = now;
            _count++;
            return GateResult.Allowed;
        }
    }
}

public static partial class Slug
{
    public static string From(string name)
    {
        var s = NonAlnum().Replace(name.ToLowerInvariant().Replace("c#", "csharp").Replace("+", "p"), "-").Trim('-');
        return s.Length == 0 ? "topic" : s.Length > 30 ? s[..30] : s;
    }

    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex NonAlnum();
}
