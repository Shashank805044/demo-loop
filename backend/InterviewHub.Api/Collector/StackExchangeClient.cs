using System.Text.Json;
using System.Text.Json.Serialization;

namespace InterviewHub.Api.Collector;

public record SourceItem(string SourceId, string Url, string Title, string QuestionHtml, string AnswerHtml);

/// <summary>Fetches accepted-answer questions from the public Stack Exchange API (no key needed, ~300 req/day/IP).</summary>
public class StackExchangeClient(HttpClient http, ILogger<StackExchangeClient> log)
{
    private const string Base = "https://api.stackexchange.com/2.3";

    public async Task<List<SourceItem>> FetchAsync(string tag, string query, int pageSize, CancellationToken ct)
    {
        var url = $"{Base}/search/advanced?order=desc&sort=votes&accepted=True&answers=1" +
                  $"&tagged={Uri.EscapeDataString(tag)}&q={Uri.EscapeDataString(query)}" +
                  $"&pagesize={pageSize}&site=stackoverflow&filter=withbody";
        var questions = await GetAsync<Question>(url, ct);

        var ids = questions.Where(q => q.AcceptedAnswerId.HasValue)
                           .Select(q => q.AcceptedAnswerId!.Value).ToList();
        if (ids.Count == 0) return [];

        var answers = await GetAsync<Answer>(
            $"{Base}/answers/{string.Join(';', ids)}?site=stackoverflow&filter=withbody", ct);
        var byId = answers.ToDictionary(a => a.AnswerId);

        return questions
            .Where(q => q.AcceptedAnswerId.HasValue && byId.ContainsKey(q.AcceptedAnswerId.Value))
            .Select(q => new SourceItem(
                $"so:{q.QuestionId}", q.Link ?? $"https://stackoverflow.com/q/{q.QuestionId}",
                System.Net.WebUtility.HtmlDecode(q.Title ?? ""), q.Body ?? "",
                byId[q.AcceptedAnswerId!.Value].Body ?? ""))
            .ToList();
    }

    private async Task<List<T>> GetAsync<T>(string url, CancellationToken ct)
    {
        using var resp = await http.GetAsync(url, ct);
        resp.EnsureSuccessStatusCode();
        var page = await resp.Content.ReadFromJsonAsync<Page<T>>(cancellationToken: ct);
        if (page?.Backoff is > 0)
        {
            log.LogWarning("Stack Exchange asked us to back off {Sec}s", page.Backoff);
            await Task.Delay(TimeSpan.FromSeconds(page.Backoff.Value), ct);
        }
        return page?.Items ?? [];
    }

    private class Page<T>
    {
        [JsonPropertyName("items")] public List<T> Items { get; set; } = [];
        [JsonPropertyName("backoff")] public int? Backoff { get; set; }
    }
    private class Question
    {
        [JsonPropertyName("question_id")] public long QuestionId { get; set; }
        [JsonPropertyName("accepted_answer_id")] public long? AcceptedAnswerId { get; set; }
        [JsonPropertyName("title")] public string? Title { get; set; }
        [JsonPropertyName("body")] public string? Body { get; set; }
        [JsonPropertyName("link")] public string? Link { get; set; }
    }
    private class Answer
    {
        [JsonPropertyName("answer_id")] public long AnswerId { get; set; }
        [JsonPropertyName("body")] public string? Body { get; set; }
    }
}
