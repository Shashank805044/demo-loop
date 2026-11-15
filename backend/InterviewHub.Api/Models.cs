namespace InterviewHub.Api;

public enum Level
{
    Beginner = 1,      // 0-2 years
    Intermediate = 2,  // 2-5 years
    Advanced = 3       // 5+ years
}

public class Topic
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Slug { get; set; } = "";
}

public class Question
{
    public int Id { get; set; }
    public int TopicId { get; set; }
    public Topic? Topic { get; set; }
    public Level Level { get; set; }
    public string Text { get; set; } = "";
    public string Answer { get; set; } = "";
    public string? SourceName { get; set; }
    public string? SourceUrl { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
