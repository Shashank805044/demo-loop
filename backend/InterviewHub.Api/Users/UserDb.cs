using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace InterviewHub.Api.Users;

/// <summary>Accounts and per-user progress. Separate from the question library (AppDb).</summary>
public class UserDb(DbContextOptions<UserDb> options) : IdentityDbContext<IdentityUser>(options)
{
    public DbSet<Attempt> Attempts => Set<Attempt>();
    public DbSet<Bookmark> Bookmarks => Set<Bookmark>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        base.OnModelCreating(b);
        b.Entity<Attempt>().HasIndex(a => new { a.UserId, a.CreatedAt });
        b.Entity<Attempt>().HasIndex(a => new { a.UserId, a.SessionId });
        b.Entity<Bookmark>().HasKey(x => new { x.UserId, x.QuestionId });
    }
}

/// <summary>One scored answer in a mock interview. Question details are copied so history survives later changes.</summary>
public class Attempt
{
    public long Id { get; set; }
    public string UserId { get; set; } = "";
    public Guid SessionId { get; set; }
    public int QuestionId { get; set; }
    public string TopicName { get; set; } = "";
    public int Level { get; set; }
    public string QuestionText { get; set; } = "";
    public string Answer { get; set; } = "";
    public int Score { get; set; }
    public string Verdict { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class Bookmark
{
    public string UserId { get; set; } = "";
    public int QuestionId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
