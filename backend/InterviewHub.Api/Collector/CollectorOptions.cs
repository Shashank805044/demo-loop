namespace InterviewHub.Api.Collector;

public class CollectorOptions
{
    public const string Section = "Collector";

    /// <summary>Run automatically in the background. Manual trigger works regardless.</summary>
    public bool Enabled { get; set; }
    public int IntervalHours { get; set; } = 24;
    /// <summary>Max candidate questions fetched per topic per run.</summary>
    public int QuestionsPerTopic { get; set; } = 10;
    /// <summary>Claude model used to rewrite and classify.</summary>
    public string Model { get; set; } = "claude-opus-5-5";
    /// <summary>Required header value (X-Admin-Key) for POST /api/admin/collect. Empty = endpoint disabled.</summary>
    public string AdminKey { get; set; } = "";
    public string[] Queries { get; set; } = ["difference between", "what is", "how does"];
    public List<TopicSource> Topics { get; set; } = [];
}

/// <summary>Add a language/tool by adding one entry in configuration - no code change.</summary>
public class TopicSource
{
    public string Slug { get; set; } = "";
    public string Name { get; set; } = "";
    /// <summary>Stack Overflow tags to search (each searched separately).</summary>
    public string[] Tags { get; set; } = [];
}
