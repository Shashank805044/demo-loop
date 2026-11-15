using InterviewHub.Api;
using System.Threading.RateLimiting;
using InterviewHub.Api.Collector;
using InterviewHub.Api.Mock;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

// Database: "Sqlite" (default, zero setup) or "SqlServer" (Azure SQL).
var provider = builder.Configuration["Database:Provider"] ?? "Sqlite";
var conn = builder.Configuration.GetConnectionString("Default") ?? "Data Source=interviewhub.db";
builder.Services.AddDbContext<AppDb>(o =>
{
    if (provider == "SqlServer") o.UseSqlServer(conn);
    else o.UseSqlite(conn);
});

builder.Services.Configure<CollectorOptions>(builder.Configuration.GetSection(CollectorOptions.Section));
builder.Services.AddHttpClient<StackExchangeClient>(c =>
{
    c.DefaultRequestHeaders.UserAgent.ParseAdd("InterviewHub/1.0");
    c.Timeout = TimeSpan.FromSeconds(30);
}).ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
{
    AutomaticDecompression = System.Net.DecompressionMethods.GZip | System.Net.DecompressionMethods.Deflate,
});
builder.Services.AddSingleton<ClaudeRewriter>();
builder.Services.AddScoped<CollectionRunner>();
builder.Services.AddHostedService<CollectorHostedService>();

builder.Services.Configure<MockOptions>(builder.Configuration.GetSection(MockOptions.Section));
builder.Services.AddSingleton<ClaudeScorer>();
// Scoring spends Claude credits on a public endpoint: limit requests per client IP.
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    var perMinute = builder.Configuration.GetValue("Mock:RequestsPerMinute", 20);
    o.AddPolicy("mock", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = perMinute, Window = TimeSpan.FromMinutes(1) }));
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
app.UseRateLimiter();

app.MapGet("/api/topics", async (AppDb db) =>
    await db.Topics.OrderBy(t => t.Name)
        .Select(t => new { t.Id, t.Name, t.Slug }).ToListAsync());

app.MapGet("/api/levels", () => new[]
{
    new { id = 1, name = "Beginner", experience = "0-2 years" },
    new { id = 2, name = "Intermediate", experience = "2-5 years" },
    new { id = 3, name = "Advanced", experience = "5+ years" },
});

IQueryable<Question> Filter(AppDb db, string? topic, int? level, string? search = null)
{
    var q = db.Questions.AsNoTracking().Include(x => x.Topic).AsQueryable();
    if (!string.IsNullOrWhiteSpace(topic)) q = q.Where(x => x.Topic!.Slug == topic);
    if (level is >= 1 and <= 3) q = q.Where(x => x.Level == (Level)level);

    // Free-text search: every word must appear in the question, answer or topic name.
    if (!string.IsNullOrWhiteSpace(search))
    {
        var terms = search.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(t => t.Length > 60 ? t[..60] : t).Take(6);
        foreach (var term in terms)
        {
            var pattern = "%" + term.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
            q = q.Where(x => EF.Functions.Like(x.Text, pattern, "\\")
                          || EF.Functions.Like(x.Answer, pattern, "\\")
                          || EF.Functions.Like(x.Topic!.Name, pattern, "\\"));
        }
    }
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

app.MapGet("/api/questions", async (AppDb db, string? topic, int? level, string? q) =>
    (await Filter(db, topic, level, q).OrderBy(x => x.Id).ToListAsync()).Select(Dto));

app.MapGet("/api/questions/random", async (AppDb db, string? topic, int? level, int count = 5) =>
{
    count = Math.Clamp(count, 1, 50);
    var all = await Filter(db, topic, level).ToListAsync();
    return all.OrderBy(_ => Random.Shared.Next()).Take(count).Select(Dto);
});

// ---- Mock interview ----
// Questions WITHOUT reference answers, so the client can't peek before answering.
app.MapGet("/api/mock/start", async (AppDb db, string? topic, int? level, int count = 5) =>
{
    count = Math.Clamp(count, 1, 20);
    var q = db.Questions.AsNoTracking().Include(x => x.Topic).AsQueryable();
    if (!string.IsNullOrWhiteSpace(topic)) q = q.Where(x => x.Topic!.Slug == topic);
    if (level is >= 1 and <= 3) q = q.Where(x => x.Level == (Level)level);
    var all = await q.ToListAsync();
    return all.OrderBy(_ => Random.Shared.Next()).Take(count).Select(x => new
    {
        x.Id, topic = x.Topic!.Name, level = x.Level.ToString(), question = x.Text,
    });
});

app.MapPost("/api/mock/score", async (ScoreRequest req, AppDb db, ClaudeScorer scorer,
    IOptions<MockOptions> opts, CancellationToken ct) =>
{
    var answer = (req.Answer ?? "").Trim();
    if (answer.Length == 0) return Results.BadRequest(new { error = "Answer is empty." });
    if (answer.Length > opts.Value.MaxAnswerChars)
        return Results.BadRequest(new { error = $"Answer too long (max {opts.Value.MaxAnswerChars} characters)." });

    var q = await db.Questions.AsNoTracking().FirstOrDefaultAsync(x => x.Id == req.QuestionId, ct);
    if (q is null) return Results.NotFound(new { error = "Unknown question." });

    if (!scorer.IsConfigured)
        return Results.Json(new { error = "AI scoring is not available (server has no API key)." }, statusCode: 503);

    Score? score;
    try { score = await scorer.ScoreAsync(q, answer, ct); }
    catch (Exception ex) when (ex is not OperationCanceledException)
    {
        app.Logger.LogError(ex, "Scoring failed");
        return Results.Json(new { error = "Scoring failed. Try again." }, statusCode: 502);
    }
    if (score is null) return Results.Json(new { error = "Could not score this answer. Try again." }, statusCode: 502);

    return Results.Ok(new
    {
        score = score.Score10, score.Verdict, score.Strengths, score.Gaps, score.Tip,
        referenceAnswer = q.Answer, // revealed only after the candidate has answered
    });
}).RequireRateLimiting("mock");

// Manual trigger. Each run spends Claude API credits, so it needs a configured key.
app.MapPost("/api/admin/collect", async (HttpContext ctx, CollectionRunner runner,
    IOptions<CollectorOptions> opts, CancellationToken ct) =>
{
    var expected = opts.Value.AdminKey;
    if (string.IsNullOrEmpty(expected)) return Results.NotFound(); // disabled
    var given = ctx.Request.Headers["X-Admin-Key"].ToString();
    var ok = System.Security.Cryptography.CryptographicOperations.FixedTimeEquals(
        System.Text.Encoding.UTF8.GetBytes(given), System.Text.Encoding.UTF8.GetBytes(expected));
    if (!ok) return Results.Unauthorized();
    return Results.Ok(await runner.RunAsync(ct));
});

app.Run();

record ScoreRequest(int QuestionId, string? Answer);
