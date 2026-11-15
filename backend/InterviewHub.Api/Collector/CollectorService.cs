using InterviewHub.Api;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace InterviewHub.Api.Collector;

public record CollectResult(int Fetched, int New, int Added, int Skipped, string? Note);

public class CollectionRunner(
    AppDb db, StackExchangeClient stack, ClaudeRewriter rewriter,
    IOptions<CollectorOptions> options, ILogger<CollectionRunner> log)
{
    private static readonly SemaphoreSlim RunLock = new(1, 1);

    public async Task<CollectResult> RunAsync(CancellationToken ct)
    {
        if (!rewriter.IsConfigured)
            return new(0, 0, 0, 0, "ANTHROPIC_API_KEY is not set; nothing collected.");
        if (!await RunLock.WaitAsync(0, ct))
            return new(0, 0, 0, 0, "A collection run is already in progress.");

        try
        {
            var o = options.Value;
            int fetched = 0, fresh = 0, added = 0, skipped = 0;

            foreach (var src in o.Topics)
            {
                var topic = await db.Topics.FirstOrDefaultAsync(t => t.Slug == src.Slug, ct);
                if (topic is null)
                {
                    topic = new Topic { Slug = src.Slug, Name = src.Name };
                    db.Topics.Add(topic);
                    await db.SaveChangesAsync(ct);
                }

                var candidates = new Dictionary<string, SourceItem>();
                foreach (var tag in src.Tags)
                    foreach (var query in o.Queries)
                    {
                        if (candidates.Count >= o.QuestionsPerTopic) break;
                        try
                        {
                            foreach (var item in await stack.FetchAsync(tag, query, o.QuestionsPerTopic, ct))
                                candidates.TryAdd(item.SourceId, item);
                        }
                        catch (HttpRequestException ex)
                        {
                            log.LogWarning("Stack Exchange fetch failed ({Tag}/{Query}): {Msg}", tag, query, ex.Message);
                        }
                    }
                fetched += candidates.Count;

                var known = (await db.Questions.Where(q => q.SourceId != null)
                    .Select(q => q.SourceId!).ToListAsync(ct)).ToHashSet();

                foreach (var item in candidates.Values.Where(c => !known.Contains(c.SourceId))
                                                      .Take(o.QuestionsPerTopic))
                {
                    fresh++;
                    Rewritten? r;
                    try { r = await rewriter.RewriteAsync(src.Name, item, ct); }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        log.LogWarning("Rewrite failed for {Id}: {Msg}", item.SourceId, ex.Message);
                        r = null;
                    }

                    // Record skipped items too would need a table; for now they are retried next run.
                    if (r is null) { skipped++; continue; }

                    db.Questions.Add(new Question
                    {
                        TopicId = topic.Id,
                        Level = r.Level,
                        Text = r.Question,
                        Answer = r.Answer,
                        SourceId = item.SourceId,
                        SourceName = "Stack Overflow (CC BY-SA)",
                        SourceUrl = item.Url,
                        UpdatedAt = DateTime.UtcNow,
                    });
                    added++;
                }
                await db.SaveChangesAsync(ct);
            }

            log.LogInformation("Collector: fetched {F}, new {N}, added {A}, skipped {S}", fetched, fresh, added, skipped);
            return new(fetched, fresh, added, skipped, null);
        }
        finally { RunLock.Release(); }
    }

    /// <summary>
    /// Fetches a few questions for one topic while a user is waiting. Creates the topic if new.
    /// Returns how many questions were added. Caller is responsible for spend limits (OnDemandGate).
    /// </summary>
    public async Task<int> CollectOnDemandAsync(string slug, string name, string[] tags, string searchText,
        int max, CancellationToken ct)
    {
        if (!rewriter.IsConfigured || tags.Length == 0 || max <= 0) return 0;

        var topic = await db.Topics.FirstOrDefaultAsync(t => t.Slug == slug, ct);
        if (topic is null)
        {
            topic = new Topic { Slug = slug, Name = name };
            db.Topics.Add(topic);
            try { await db.SaveChangesAsync(ct); }
            catch (DbUpdateException) // another request created it first
            {
                db.ChangeTracker.Clear();
                topic = await db.Topics.FirstAsync(t => t.Slug == slug, ct);
            }
        }

        var candidates = new Dictionary<string, SourceItem>();
        foreach (var tag in tags)
        {
            try
            {
                foreach (var item in await stack.FetchAsync(tag, searchText, max + 3, ct))
                    candidates.TryAdd(item.SourceId, item);
            }
            catch (HttpRequestException ex)
            {
                log.LogWarning("On-demand fetch failed ({Tag}): {Msg}", tag, ex.Message);
            }
        }

        var known = (await db.Questions.Where(q => q.SourceId != null).Select(q => q.SourceId!).ToListAsync(ct)).ToHashSet();
        var fresh = candidates.Values.Where(c => !known.Contains(c.SourceId)).Take(max + 3).ToList();
        if (fresh.Count == 0) return 0;

        // Rewrite in parallel (a few at a time) so the user isn't waiting on them one by one.
        using var gate = new SemaphoreSlim(4);
        var rewritten = await Task.WhenAll(fresh.Select(async item =>
        {
            await gate.WaitAsync(ct);
            try { return (item, r: await rewriter.RewriteAsync(name, item, ct)); }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                log.LogWarning("On-demand rewrite failed for {Id}: {Msg}", item.SourceId, ex.Message);
                return (item, r: (Rewritten?)null);
            }
            finally { gate.Release(); }
        }));

        var added = 0;
        foreach (var (item, r) in rewritten)
        {
            if (r is null || added >= max) continue;
            db.Questions.Add(new Question
            {
                TopicId = topic.Id,
                Level = r.Level,
                Text = r.Question,
                Answer = r.Answer,
                SourceId = item.SourceId,
                SourceName = "Stack Overflow (CC BY-SA)",
                SourceUrl = item.Url,
                UpdatedAt = DateTime.UtcNow,
            });
            added++;
        }

        try { await db.SaveChangesAsync(ct); }
        catch (DbUpdateException ex)
        {
            log.LogWarning("On-demand save conflict (likely concurrent duplicate): {Msg}", ex.InnerException?.Message ?? ex.Message);
            db.ChangeTracker.Clear();
            return 0;
        }
        return added;
    }
}

/// <summary>Optional daily background run (Collector:Enabled = true).</summary>
public class CollectorHostedService(IServiceProvider sp, IOptions<CollectorOptions> options,
    ILogger<CollectorHostedService> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        if (!options.Value.Enabled) return;
        using var timer = new PeriodicTimer(TimeSpan.FromHours(Math.Max(1, options.Value.IntervalHours)));
        do
        {
            try
            {
                using var scope = sp.CreateScope();
                var result = await scope.ServiceProvider.GetRequiredService<CollectionRunner>().RunAsync(ct);
                log.LogInformation("Scheduled collection: {Result}", result);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                log.LogError(ex, "Scheduled collection failed");
            }
        } while (await timer.WaitForNextTickAsync(ct));
    }
}
