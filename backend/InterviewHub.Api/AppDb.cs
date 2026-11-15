using Microsoft.EntityFrameworkCore;

namespace InterviewHub.Api;

public class AppDb(DbContextOptions<AppDb> options) : DbContext(options)
{
    public DbSet<Topic> Topics => Set<Topic>();
    public DbSet<Question> Questions => Set<Question>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Topic>().HasIndex(t => t.Slug).IsUnique();
        b.Entity<Question>().HasIndex(q => new { q.TopicId, q.Level });
        b.Entity<Question>().Property(q => q.Level).HasConversion<int>();
    }
}
