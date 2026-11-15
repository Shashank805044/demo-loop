using InterviewHub.Api;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// Database: "Sqlite" (default, zero setup) or "SqlServer" (Azure SQL).
var provider = builder.Configuration["Database:Provider"] ?? "Sqlite";
var conn = builder.Configuration.GetConnectionString("Default") ?? "Data Source=interviewhub.db";
builder.Services.AddDbContext<AppDb>(o =>
{
    if (provider == "SqlServer") o.UseSqlServer(conn);
    else o.UseSqlite(conn);
});

builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>()
                 ?? ["http://localhost:5173"])
    .AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    db.Database.EnsureCreated(); // swap for EF migrations before production
    SeedData.Apply(db);
}

app.UseCors();

app.MapGet("/api/topics", async (AppDb db) =>
    await db.Topics.OrderBy(t => t.Name)
        .Select(t => new { t.Id, t.Name, t.Slug }).ToListAsync());

app.MapGet("/api/levels", () => new[]
{
    new { id = 1, name = "Beginner", experience = "0-2 years" },
    new { id = 2, name = "Intermediate", experience = "2-5 years" },
    new { id = 3, name = "Advanced", experience = "5+ years" },
});

IQueryable<Question> Filter(AppDb db, string? topic, int? level)
{
    var q = db.Questions.AsNoTracking().Include(x => x.Topic).AsQueryable();
    if (!string.IsNullOrWhiteSpace(topic)) q = q.Where(x => x.Topic!.Slug == topic);
    if (level is >= 1 and <= 3) q = q.Where(x => x.Level == (Level)level);
    return q;
}

object Dto(Question x) => new
{
    x.Id,
    topic = x.Topic!.Name,
    topicSlug = x.Topic.Slug,
    level = x.Level.ToString(),
    question = x.Text,
    answer = x.Answer,
    sourceName = x.SourceName,
    sourceUrl = x.SourceUrl,
    updatedAt = x.UpdatedAt,
};

app.MapGet("/api/questions", async (AppDb db, string? topic, int? level) =>
    (await Filter(db, topic, level).OrderBy(x => x.Id).ToListAsync()).Select(Dto));

app.MapGet("/api/questions/random", async (AppDb db, string? topic, int? level, int count = 5) =>
{
    count = Math.Clamp(count, 1, 50);
    var all = await Filter(db, topic, level).ToListAsync();
    return all.OrderBy(_ => Random.Shared.Next()).Take(count).Select(Dto);
});

app.Run();
