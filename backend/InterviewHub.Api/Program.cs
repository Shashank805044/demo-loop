using InterviewHub.Api;
using System.Threading.RateLimiting;
using InterviewHub.Api.Collector;
using InterviewHub.Api.Mock;
using InterviewHub.Api.Search;
using InterviewHub.Api.Users;
using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Storage;
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

// Accounts and progress live in their own database so the question library is never touched.
var usersConn = builder.Configuration.GetConnectionString("Users")
    ?? (provider == "SqlServer" ? conn : "Data Source=users.db");
builder.Services.AddDbContext<UserDb>(o =>
{
    if (provider == "SqlServer") o.UseSqlServer(usersConn);
    else o.UseSqlite(usersConn);
});
builder.Services.AddIdentityApiEndpoints<IdentityUser>(o =>
{
    o.User.RequireUniqueEmail = true;
    o.Password.RequiredLength = 8; // length matters more than composition rules
    o.Password.RequireDigit = false;
    o.Password.RequireLowercase = false;
    o.Password.RequireUppercase = false;
    o.Password.RequireNonAlphanumeric = false;
    // Lockout (5 failed logins -> 5 minutes) is on by default.
}).AddEntityFrameworkStores<UserDb>();
builder.Services.AddAuthorization();

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
builder.Services.AddSingleton<ClaudeSearchPlanner>();
builder.Services.AddSingleton<OnDemandGate>();
builder.Services.Configure<OnDemandOptions>(builder.Configuration.GetSection(OnDemandOptions.Section));
// Scoring spends Claude credits on a public endpoint: limit requests per client IP.
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    var perMinute = builder.Configuration.GetValue("Mock:RequestsPerMinute", 20);
    // Logged-in users get their own bucket; everyone else is limited by IP.
    o.AddPolicy("mock", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.User.FindFirstValue(ClaimTypes.NameIdentifier) is { } uid
            ? "u:" + uid : "ip:" + (ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown"),
        _ => new FixedWindowRateLimiterOptions { PermitLimit = perMinute, Window = TimeSpan.FromMinutes(1) }));
    // Sign-up / sign-in: slow down password guessing and account spam.
    o.AddPolicy("auth", ctx => RateLimitPartition.GetFixedWindowLimiter(
        "ip:" + (ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown"),
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
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

    var udb = scope.ServiceProvider.GetRequiredService<UserDb>();
    // On SQL Server the user tables share an existing database, where EnsureCreated does nothing:
    // create just the missing tables instead. (Use EF migrations before production.)
    if (!udb.Database.EnsureCreated())
    {
        try { ((RelationalDatabaseCreator)udb.Database.GetService<IDatabaseCreator>()).CreateTables(); }
        catch (Exception) { /* tables already exist */ }
    }
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

// Register / login / refresh / manage: built-in endpoints under /api/auth. Bearer tokens, no cookies.
app.MapGroup("/api/auth").MapIdentityApi<IdentityUser>().RequireRateLimiting("auth");
app.MapUserEndpoints();

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

object Dto(Question x) => Dtos.Question(x);

app.MapGet("/api/questions", async (AppDb db, string? topic, int? level, string? q) =>
    (await Filter(db, topic, level, q).OrderBy(x => x.Id).ToListAsync()).Select(Dto));

app.MapGet("/api/questions/random", async (AppDb db, string? topic, int? level, int count = 5) =>
{
    count = Math.Clamp(count, 1, 50);
    var all = await Filter(db, topic, level).ToListAsync();
    return all.OrderBy(_ => Random.Shared.Next()).Take(count).Select(Dto);
});

// ---- Smart (AI-assisted) search ----
// "latest .net questions" -> { topic: dotnet, newest: true }. Results always come from stored
// questions; the model only produces filters, which are validated before use.
app.MapGet("/api/search", async (string? q, AppDb db, ClaudeSearchPlanner planner, CollectionRunner runner,
    OnDemandGate gate, IOptions<OnDemandOptions> onDemandOpts, IOptions<CollectorOptions> collectorOpts,
    CancellationToken ct) =>
{
    var od = onDemandOpts.Value;
    q = (q ?? "").Trim();
    if (q.Length == 0) return Results.BadRequest(new { error = "Enter something to search for." });
    if (q.Length > 200) q = q[..200];

    var topics = (await db.Topics.AsNoTracking().ToListAsync(ct)).Select(t => (t.Slug, t.Name)).ToList();

    SearchPlan? plan = null;
    try { plan = await planner.PlanAsync(q, topics, ct); }
    catch (Exception ex) when (ex is not OperationCanceledException)
    {
        app.Logger.LogWarning("Search planning failed, using keyword search: {Msg}", ex.Message);
    }

    // No AI available (or it failed): plain keyword search.
    if (plan is null)
    {
        var plain = await Filter(db, null, null, q).OrderBy(x => x.Id).ToListAsync(ct);
        return Results.Ok(new { usedAI = false, summary = $"Keyword search for “{q}”", questions = plain.Select(Dto) });
    }

    // Nothing actionable understood (no topic, level, keyword or "newest"): don't return everything.
    // Fall back to matching the typed words literally.
    if (plan.TopicSlug is null && plan.TopicName is null && plan.Level is null
        && plan.Keywords.Length == 0 && !plan.Newest)
    {
        var literal = await Filter(db, null, null, q).OrderBy(x => x.Id).ToListAsync(ct);
        return Results.Ok(new
        {
            usedAI = true,
            fetched = 0,
            summary = $"Keyword search for “{q}”",
            note = literal.Count == 0 ? "I couldn't tell what you're looking for. Try a technology name, like “Docker” or “Python”." : null,
            questions = literal.Select(Dto),
        });
    }

    var keywords = string.Join(' ', plan.Keywords);

    // A technology we don't store yet (e.g. Docker): filter by its would-be slug so we match nothing
    // (and then fetch) instead of matching everything.
    var effSlug = plan.TopicSlug ?? (plan.TopicName is { } tn ? Slug.From(tn) : null);
    var displayName = topics.FirstOrDefault(t => t.Slug == effSlug).Name ?? plan.TopicName;

    IQueryable<Question> Build(string? kw) => Filter(db, effSlug, plan.Level, kw);
    IOrderedQueryable<Question> Order(IQueryable<Question> s) => plan.Newest
        ? s.OrderByDescending(x => x.UpdatedAt).ThenByDescending(x => x.Id)
        : s.OrderBy(x => x.Id);

    async Task<(List<Question> Results, bool Relaxed)> RunQuery()
    {
        var res = await Order(Build(keywords)).ToListAsync(ct);
        // Keywords too strict: fall back to topic/level only so the user still sees something.
        // Only when a topic or level still narrows the list; otherwise "no match" is the honest answer.
        if (res.Count == 0 && keywords.Length > 0 && (effSlug is not null || plan.Level is not null))
        {
            res = await Order(Build(null)).ToListAsync(ct);
            return (res, res.Count > 0);
        }
        return (res, false);
    }

    var (results, relaxed) = await RunQuery();

    // Too few stored questions: look on the internet, store what we find, then answer from the database.
    var fetched = 0;
    string? fetchNote = null;
    if (od.Enabled && results.Count < od.MinStoredResults && effSlug is not null && displayName is not null)
    {
        var tags = plan.Tags is { Length: > 0 } t0 ? t0
            : collectorOpts.Value.Topics.FirstOrDefault(t => t.Slug == effSlug)?.Tags.Take(2).ToArray() ?? [];
        var phrase = !string.IsNullOrWhiteSpace(plan.SearchText) ? plan.SearchText
            : keywords.Length > 0 ? keywords : "what is";

        if (tags.Length > 0)
        {
            var allowed = gate.TryAcquire($"{effSlug}|{phrase.ToLowerInvariant()}", od);
            if (allowed == GateResult.Allowed)
            {
                try
                {
                    fetched = await runner.CollectOnDemandAsync(effSlug, displayName, tags, phrase,
                        od.MaxQuestionsPerSearch, ct);
                }
                catch (Exception ex) when (ex is not OperationCanceledException)
                {
                    app.Logger.LogWarning("On-demand fetch failed: {Msg}", ex.Message);
                }
                if (fetched > 0) (results, relaxed) = await RunQuery();
                else fetchNote = "I looked online but found no good interview questions for this.";
            }
            else if (allowed == GateResult.DailyLimit)
                fetchNote = "Online lookups have reached today's limit. Showing what's stored.";
            // Cooldown: we already looked for this recently; just show what's stored.
        }
    }

    var parts = new List<string>();
    if (plan.Newest) parts.Add("newest first");
    if (displayName is not null) parts.Add(displayName);
    if (plan.Level is { } lv) parts.Add(((Level)lv).ToString());
    if (plan.Keywords.Length > 0 && !relaxed) parts.Add("about " + string.Join(", ", plan.Keywords));

    string? note = null;
    if (fetched > 0)
        note = $"Found {fetched} new question{(fetched == 1 ? "" : "s")} online and added {(fetched == 1 ? "it" : "them")} to the library.";
    else if (relaxed)
        note = $"No questions mention “{string.Join(", ", plan.Keywords)}” yet, so showing everything that matches the rest of your search.";
    else if (results.Count == 0)
    {
        // Distinguish "nothing on this topic" from "nothing at this level".
        var topicHasAny = effSlug is not null && await db.Questions.AnyAsync(x => x.Topic!.Slug == effSlug, ct);
        note = fetchNote
            ?? (topicHasAny && plan.Level is { } missing
                ? $"No {(Level)missing} questions for {displayName} yet. Try another level."
                : "No matching questions yet.");
    }
    else if (fetchNote is not null)
        note = fetchNote;

    return Results.Ok(new
    {
        usedAI = true,
        note,
        fetched,
        summary = parts.Count > 0 ? string.Join(" · ", parts) : "All topics",
        interpretation = new { topic = effSlug, level = plan.Level, keywords = plan.Keywords, newest = plan.Newest },
        relaxed,
        questions = results.Select(Dto),
    });
}).RequireRateLimiting("mock");

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

app.MapPost("/api/mock/score", async (ScoreRequest req, ClaimsPrincipal user, AppDb db, UserDb udb,
    ClaudeScorer scorer, IOptions<MockOptions> opts, CancellationToken ct) =>
{
    var answer = (req.Answer ?? "").Trim();
    if (answer.Length == 0) return Results.BadRequest(new { error = "Answer is empty." });
    if (answer.Length > opts.Value.MaxAnswerChars)
        return Results.BadRequest(new { error = $"Answer too long (max {opts.Value.MaxAnswerChars} characters)." });

    var q = await db.Questions.AsNoTracking().Include(x => x.Topic)
        .FirstOrDefaultAsync(x => x.Id == req.QuestionId, ct);
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

    // Logged-in users: keep the attempt. A save failure must not lose the score the user just paid for.
    var saved = false;
    if (user.FindFirstValue(ClaimTypes.NameIdentifier) is { } uid)
    {
        try
        {
            udb.Attempts.Add(new Attempt
            {
                UserId = uid,
                SessionId = req.SessionId ?? Guid.NewGuid(),
                QuestionId = q.Id,
                TopicName = q.Topic!.Name,
                Level = (int)q.Level,
                QuestionText = q.Text.Length > 1000 ? q.Text[..1000] : q.Text,
                Answer = answer,
                Score = score.Score10,
                Verdict = score.Verdict.Length > 500 ? score.Verdict[..500] : score.Verdict,
            });
            await udb.SaveChangesAsync(ct);
            saved = true;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            app.Logger.LogError(ex, "Could not save attempt");
        }
    }

    return Results.Ok(new
    {
        saved,
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

record ScoreRequest(int QuestionId, string? Answer, Guid? SessionId);
