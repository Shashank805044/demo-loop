using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace InterviewHub.Api.Users;

public static class Dtos
{
    /// <summary>Shape of a question sent to the browser (includes the answer).</summary>
    public static object Question(Question x) => new
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
}

public static class UserEndpoints
{
    private static string Id(ClaimsPrincipal u) => u.FindFirstValue(ClaimTypes.NameIdentifier)!;

    public static void MapUserEndpoints(this WebApplication app)
    {
        var me = app.MapGroup("/api/me").RequireAuthorization().RequireRateLimiting("mock");

        // ---- Progress summary ----
        me.MapGet("/progress", async (ClaimsPrincipal user, UserDb db, CancellationToken ct) =>
        {
            var uid = Id(user);
            var all = await db.Attempts.AsNoTracking().Where(a => a.UserId == uid)
                .OrderByDescending(a => a.CreatedAt).Take(2000).ToListAsync(ct);

            double Avg(IEnumerable<Attempt> xs) => Math.Round(xs.Average(a => a.Score), 1);

            var byTopic = all.GroupBy(a => a.TopicName)
                .Select(g => new { topic = g.Key, answered = g.Count(), average = Avg(g) })
                .OrderByDescending(x => x.answered).ToList();

            var byLevel = all.GroupBy(a => a.Level).OrderBy(g => g.Key)
                .Select(g => new { level = ((Level)g.Key).ToString(), answered = g.Count(), average = Avg(g) }).ToList();

            var sessions = all.GroupBy(a => a.SessionId)
                .Select(g => new
                {
                    sessionId = g.Key,
                    startedAt = g.Min(a => a.CreatedAt),
                    answered = g.Count(),
                    average = Avg(g),
                    topics = g.Select(a => a.TopicName).Distinct().ToList(),
                })
                .OrderByDescending(s => s.startedAt).Take(10).ToList();

            return Results.Ok(new
            {
                totalAnswered = all.Count,
                averageScore = all.Count > 0 ? Avg(all) : (double?)null,
                byTopic,
                byLevel,
                // Needs at least 2 answers in a topic before calling it "weak".
                weakest = byTopic.Where(t => t.answered >= 2).OrderBy(t => t.average).Take(3).ToList(),
                sessions,
                recent = all.Take(15).Select(a => new
                {
                    a.QuestionId, topic = a.TopicName, level = ((Level)a.Level).ToString(),
                    question = a.QuestionText, a.Score, a.Verdict, a.CreatedAt,
                }),
            });
        });

        // ---- Bookmarks ----
        me.MapGet("/bookmarks", async (ClaimsPrincipal user, UserDb udb, AppDb db, CancellationToken ct) =>
        {
            var uid = Id(user);
            var ids = await udb.Bookmarks.AsNoTracking().Where(b => b.UserId == uid)
                .OrderByDescending(b => b.CreatedAt).Select(b => b.QuestionId).ToListAsync(ct);
            var found = await db.Questions.AsNoTracking().Include(q => q.Topic)
                .Where(q => ids.Contains(q.Id)).ToListAsync(ct);
            var byId = found.ToDictionary(q => q.Id);
            return ids.Where(byId.ContainsKey).Select(i => Dtos.Question(byId[i]));
        });

        me.MapPut("/bookmarks/{questionId:int}", async (int questionId, ClaimsPrincipal user, UserDb udb, AppDb db, CancellationToken ct) =>
        {
            var uid = Id(user);
            if (!await db.Questions.AnyAsync(q => q.Id == questionId, ct)) return Results.NotFound();
            if (!await udb.Bookmarks.AnyAsync(b => b.UserId == uid && b.QuestionId == questionId, ct))
            {
                udb.Bookmarks.Add(new Bookmark { UserId = uid, QuestionId = questionId });
                try { await udb.SaveChangesAsync(ct); }
                catch (DbUpdateException) { /* concurrent duplicate: already bookmarked */ }
            }
            return Results.NoContent();
        });

        me.MapDelete("/bookmarks/{questionId:int}", async (int questionId, ClaimsPrincipal user, UserDb udb, CancellationToken ct) =>
        {
            var uid = Id(user);
            await udb.Bookmarks.Where(b => b.UserId == uid && b.QuestionId == questionId).ExecuteDeleteAsync(ct);
            return Results.NoContent();
        });

        // ---- Delete account and all stored data ----
        me.MapDelete("", async (ClaimsPrincipal user, UserDb udb, UserManager<IdentityUser> users, CancellationToken ct) =>
        {
            var uid = Id(user);
            await udb.Attempts.Where(a => a.UserId == uid).ExecuteDeleteAsync(ct);
            await udb.Bookmarks.Where(b => b.UserId == uid).ExecuteDeleteAsync(ct);
            var account = await users.FindByIdAsync(uid);
            if (account is not null) await users.DeleteAsync(account);
            return Results.NoContent();
        });
    }
}
