using System.Net;
using Jellyfin.Plugin.TorrentClaw.Configuration;
using Jellyfin.Plugin.TorrentClaw.Security;
using Microsoft.Extensions.Logging;

namespace Jellyfin.Plugin.TorrentClaw.Tests;

internal sealed class TestConfiguration : ITorrentClawConfiguration
{
    public TorrentClawSettings TorrentClaw { get; set; } =
        new("https://unit.test", "tc_test_dummy_key", 15, 0);

    public QbittorrentSettings Qbittorrent { get; set; } =
        new("http://127.0.0.1:8080", "user", "password", 15, "movies", "C:\\Movies", "C:\\TV", "C:\\Downloads");

    public TorrentClawSettings GetTorrentClawSettings() => TorrentClaw;

    public QbittorrentSettings GetQbittorrentSettings() => Qbittorrent;
}

internal sealed class FixedCredentials : ITorrentClawCredentialsProvider
{
    private readonly string _value;

    public FixedCredentials(string value = "tc_test_dummy_key") => _value = value;

    public ValueTask<string> GetApiKeyAsync(CancellationToken cancellationToken) =>
        ValueTask.FromResult(_value);
}

internal sealed class FixedDevelopmentCredentials : IDevelopmentApiKeyFileCredentialsProvider
{
    private readonly Func<ValueTask<string>> _factory;

    public FixedDevelopmentCredentials(string value) => _factory = () => ValueTask.FromResult(value);

    public FixedDevelopmentCredentials(Exception exception) => _factory = () => ValueTask.FromException<string>(exception);

    public ValueTask<string> GetApiKeyAsync(CancellationToken cancellationToken) => _factory();
}

internal sealed class TestUrlValidator : IUrlSecurityValidator
{
    public ValueTask<Uri> ValidateExternalServiceAsync(string value, CancellationToken cancellationToken) =>
        ValueTask.FromResult(new Uri(value.EndsWith('/') ? value : value + "/"));

    public Uri ValidateQbittorrent(string value) => new(value.EndsWith('/') ? value : value + "/");
}

internal sealed class QueueHttpHandler : HttpMessageHandler
{
    private readonly Queue<Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>>> _responses = new();

    public List<HttpRequestMessageSnapshot> Requests { get; } = [];

    public void Enqueue(HttpStatusCode status, string body, string contentType = "application/json") =>
        _responses.Enqueue((_, _) => Task.FromResult(new HttpResponseMessage(status)
        {
            Content = new StringContent(body, System.Text.Encoding.UTF8, contentType)
        }));

    public void Enqueue(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> response) =>
        _responses.Enqueue(response);

    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        var body = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
        Requests.Add(new HttpRequestMessageSnapshot(
            request.Method,
            request.RequestUri!,
            request.Headers.ToDictionary(header => header.Key, header => string.Join(",", header.Value)),
            body));
        if (_responses.Count == 0)
        {
            throw new InvalidOperationException("No queued HTTP response.");
        }

        return await _responses.Dequeue()(request, cancellationToken);
    }
}

internal sealed record HttpRequestMessageSnapshot(
    HttpMethod Method,
    Uri Uri,
    IReadOnlyDictionary<string, string> Headers,
    string? Body);

internal sealed class SingleClientFactory : IHttpClientFactory, IDisposable
{
    private readonly HttpClient _client;

    public SingleClientFactory(HttpMessageHandler handler) => _client = new HttpClient(handler);

    public HttpClient CreateClient(string name) => _client;

    public void Dispose() => _client.Dispose();
}

internal sealed class ListLogger<T> : ILogger<T>
{
    public List<string> Messages { get; } = [];

    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

    public bool IsEnabled(LogLevel logLevel) => true;

    public void Log<TState>(
        LogLevel logLevel,
        EventId eventId,
        TState state,
        Exception? exception,
        Func<TState, Exception?, string> formatter) => Messages.Add(formatter(state, exception));
}
