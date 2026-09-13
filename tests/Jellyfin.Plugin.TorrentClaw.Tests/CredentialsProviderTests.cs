using Jellyfin.Plugin.TorrentClaw.Configuration;

namespace Jellyfin.Plugin.TorrentClaw.Tests;

public sealed class CredentialsProviderTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "TorrentClawTests-" + Guid.NewGuid().ToString("N"));

    public CredentialsProviderTests() => Directory.CreateDirectory(_root);

    [Fact]
    public async Task DevelopmentFileLoadsAndTrimsKey()
    {
        await File.WriteAllTextAsync(Path.Combine(_root, "API_KEY.txt"), " \r\ntc_test_dummy_key\n ");
        var provider = new DevelopmentApiKeyFileCredentialsProvider(_root);

        var value = await provider.GetApiKeyAsync(CancellationToken.None);

        Assert.Equal("tc_test_dummy_key", value);
    }

    [Fact]
    public async Task DevelopmentFileMissingHasExactSafeMessage()
    {
        var provider = new DevelopmentApiKeyFileCredentialsProvider(_root);

        var exception = await Assert.ThrowsAsync<TorrentClawConfigurationException>(
            async () => await provider.GetApiKeyAsync(CancellationToken.None));

        Assert.Equal("TorrentClaw development API key file API_KEY.txt not found.", exception.Message);
    }

    [Fact]
    public async Task DevelopmentFileEmptyHasExactSafeMessage()
    {
        await File.WriteAllTextAsync(Path.Combine(_root, "API_KEY.txt"), " \r\n ");
        var provider = new DevelopmentApiKeyFileCredentialsProvider(_root);

        var exception = await Assert.ThrowsAsync<TorrentClawConfigurationException>(
            async () => await provider.GetApiKeyAsync(CancellationToken.None));

        Assert.Equal("TorrentClaw API key is empty.", exception.Message);
    }

    [Fact]
    public async Task ConfiguredJellyfinKeyTakesPrecedence()
    {
        var configuration = new TestConfiguration
        {
            TorrentClaw = new TorrentClawSettings("https://unit.test", " configured_key ", 15, 0)
        };
        var provider = new TorrentClawCredentialsProvider(
            configuration,
            new FixedDevelopmentCredentials(new InvalidOperationException("File must not be read")),
            true);

        var value = await provider.GetApiKeyAsync(CancellationToken.None);

        Assert.Equal("configured_key", value);
    }

    [Fact]
    public async Task DevelopmentFileIsNotUsedInProduction()
    {
        var configuration = new TestConfiguration
        {
            TorrentClaw = new TorrentClawSettings("https://unit.test", null, 15, 0)
        };
        var provider = new TorrentClawCredentialsProvider(
            configuration,
            new FixedDevelopmentCredentials("tc_test_dummy_key"),
            false);

        var exception = await Assert.ThrowsAsync<TorrentClawConfigurationException>(
            async () => await provider.GetApiKeyAsync(CancellationToken.None));

        Assert.Equal("TorrentClaw API key is not configured in Jellyfin.", exception.Message);
    }

    public void Dispose()
    {
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, true);
        }
    }
}
