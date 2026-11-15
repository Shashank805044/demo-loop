namespace InterviewHub.Api;

// Starter content (original wording). The collector job will add fresh
// questions from the internet later; each item can carry a source link.
public static class SeedData
{
    public static void Apply(AppDb db)
    {
        if (db.Topics.Any()) return;

        var dotnet = new Topic { Name = ".NET", Slug = "dotnet" };
        var azure = new Topic { Name = "Azure", Slug = "azure" };
        var sql = new Topic { Name = "SQL", Slug = "sql" };
        db.Topics.AddRange(dotnet, azure, sql);

        Question Q(Topic t, Level l, string q, string a) =>
            new() { Topic = t, Level = l, Text = q, Answer = a, SourceName = "Starter set" };

        db.Questions.AddRange(
            // ---- .NET ----
            Q(dotnet, Level.Beginner, "What is the difference between value types and reference types in C#?",
                "Value types (int, struct, enum) store their data directly and are copied on assignment. Reference types (class, string, arrays) store a reference to an object on the heap, so assignment copies the reference, not the object."),
            Q(dotnet, Level.Beginner, "What does the 'using' statement do?",
                "It guarantees Dispose() is called on an IDisposable object when the block ends, even if an exception is thrown, so resources like files and connections are released."),
            Q(dotnet, Level.Intermediate, "Explain async/await and what happens at an await.",
                "await frees the current thread while the awaited Task is incomplete; the method is turned into a state machine and resumes (on the captured context if any) when the Task finishes. It improves scalability for I/O-bound work, not CPU-bound work."),
            Q(dotnet, Level.Intermediate, "What are the DI service lifetimes in ASP.NET Core?",
                "Transient: new instance each time. Scoped: one per request. Singleton: one for the app's lifetime. Injecting a scoped service into a singleton is a bug (captive dependency)."),
            Q(dotnet, Level.Advanced, "How does the garbage collector's generational model work, and how do you reduce GC pressure?",
                "Objects start in Gen 0 and are promoted to Gen 1 and Gen 2 if they survive; large objects go on the LOH. Reduce pressure by avoiding needless allocations, using Span<T>/ArrayPool, pooling, structs where appropriate, and avoiding large short-lived arrays."),
            Q(dotnet, Level.Advanced, "How would you diagnose a memory leak in a production .NET service?",
                "Capture dumps or use dotnet-counters/dotnet-gcdump to see growth, compare heap snapshots to find rooted objects, and check usual suspects: static caches, event handler subscriptions, undisposed resources, and captive dependencies in DI."),

            // ---- Azure ----
            Q(azure, Level.Beginner, "What is the difference between IaaS, PaaS and SaaS?",
                "IaaS gives you virtual machines and networking (you manage OS and up). PaaS gives a managed platform to run code (e.g. App Service). SaaS is a finished application (e.g. Microsoft 365)."),
            Q(azure, Level.Beginner, "What is a resource group?",
                "A logical container for related Azure resources that share a lifecycle. You can deploy, manage permissions on, and delete them together."),
            Q(azure, Level.Intermediate, "When would you use Azure Functions vs App Service?",
                "Functions suit event-driven, short-running, bursty work with pay-per-execution scaling. App Service suits always-on web apps and APIs with predictable load and full app hosting features."),
            Q(azure, Level.Intermediate, "What is a managed identity and why use it?",
                "An identity Azure manages for a resource so it can authenticate to other services (Key Vault, SQL, Storage) without storing secrets or connection-string passwords in code or config."),
            Q(azure, Level.Advanced, "How would you design a highly available, multi-region web application on Azure?",
                "Deploy to paired regions behind Azure Front Door or Traffic Manager, use zone-redundant services, geo-replicate data (Azure SQL failover groups or Cosmos DB multi-region), keep the app stateless, and automate failover and test it regularly."),
            Q(azure, Level.Advanced, "How do you secure secrets and network access for an app talking to Azure SQL?",
                "Use managed identity with Entra ID authentication, store any remaining secrets in Key Vault, restrict access with Private Endpoints/VNet integration, disable public access, and enable auditing and Defender for SQL."),

            // ---- SQL ----
            Q(sql, Level.Beginner, "What is the difference between INNER JOIN and LEFT JOIN?",
                "INNER JOIN returns only rows with matches in both tables. LEFT JOIN returns all rows from the left table, with NULLs for right-side columns when there is no match."),
            Q(sql, Level.Beginner, "What is the difference between WHERE and HAVING?",
                "WHERE filters rows before grouping; HAVING filters groups after aggregation (e.g. HAVING COUNT(*) > 5)."),
            Q(sql, Level.Intermediate, "What is the difference between a clustered and non-clustered index?",
                "A clustered index defines the physical order of the table's rows (one per table). A non-clustered index is a separate structure with key values and pointers to the rows (many allowed)."),
            Q(sql, Level.Intermediate, "How do you find and fix a slow query?",
                "Look at the execution plan for scans, key lookups and bad estimates; check missing or unused indexes, SARGability of predicates, statistics, and parameter sniffing; then rewrite the query or add the right index and re-measure."),
            Q(sql, Level.Advanced, "Explain isolation levels and how snapshot isolation differs from read committed.",
                "Isolation levels trade consistency for concurrency. Read committed uses locks, so readers can block writers. Snapshot isolation uses row versioning so readers see a consistent snapshot without blocking, at the cost of tempdb/version store overhead and possible update conflicts."),
            Q(sql, Level.Advanced, "What causes deadlocks and how do you prevent them?",
                "Two transactions hold locks the other needs. Prevent by accessing objects in a consistent order, keeping transactions short, using appropriate indexes, using row-versioning isolation, and retrying on deadlock error 1205.")
        );

        db.SaveChanges();
    }
}
