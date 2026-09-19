using Jellyfin.Plugin.TorrentClaw.Clients;
using Jellyfin.Plugin.TorrentClaw.Configuration;
using Jellyfin.Plugin.TorrentClaw.Security;
using Jellyfin.Plugin.TorrentClaw.Services;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Jellyfin.Plugin.TorrentClaw;

public sealed class PluginServiceRegistrator : IPluginServiceRegistrator
{
    public const string UserAgent = "Jellyfin.Plugin.TorrentClaw/0.1.1";

    public void RegisterServices(
        IServiceCollection serviceCollection,
        IServerApplicationHost applicationHost)
    {
        serviceCollection.AddHttpClient("TorrentClaw", client =>
        {
            client.DefaultRequestHeaders.UserAgent.ParseAdd(UserAgent);
        }).ConfigurePrimaryHttpMessageHandler(CreateSecureHandler);
        serviceCollection.AddHttpClient("Qbittorrent", client =>
        {
            client.DefaultRequestHeaders.UserAgent.ParseAdd(UserAgent);
        }).ConfigurePrimaryHttpMessageHandler(CreateSecureHandler);
        serviceCollection.AddHttpClient(PosterService.HttpClientName, client =>
        {
            client.DefaultRequestHeaders.UserAgent.ParseAdd(UserAgent);
            client.Timeout = TimeSpan.FromSeconds(15);
        }).ConfigurePrimaryHttpMessageHandler(CreatePosterHandler);

        serviceCollection.AddSingleton<ITorrentClawConfiguration, PluginConfigurationProvider>();
        serviceCollection.AddSingleton<IPluginConfigurationStore, PluginConfigurationStore>();
        serviceCollection.AddSingleton<IUrlSecurityValidator, UrlSecurityValidator>();
        serviceCollection.AddSingleton<IDevelopmentApiKeyFileCredentialsProvider>(provider =>
        {
            var environment = provider.GetRequiredService<IHostEnvironment>();
            var configuredRoot = Environment.GetEnvironmentVariable("TORRENTCLAW_DEVELOPMENT_ROOT");
            return new DevelopmentApiKeyFileCredentialsProvider(
                string.IsNullOrWhiteSpace(configuredRoot)
                    ? environment.ContentRootPath
                    : configuredRoot);
        });
        serviceCollection.AddSingleton<ITorrentClawCredentialsProvider>(provider =>
        {
            var environment = provider.GetRequiredService<IHostEnvironment>();
            return new TorrentClawCredentialsProvider(
                provider.GetRequiredService<ITorrentClawConfiguration>(),
                provider.GetRequiredService<IDevelopmentApiKeyFileCredentialsProvider>(),
                environment.IsDevelopment());
        });

        serviceCollection.AddSingleton<ITorrentClawClient, TorrentClawClient>();
        serviceCollection.AddSingleton<IQbittorrentClient, QbittorrentClient>();
        serviceCollection.AddSingleton<IReleaseRankingService, ReleaseRankingService>();
        serviceCollection.AddSingleton<IPosterService, PosterService>();
        serviceCollection.AddSingleton<ISearchService, SearchService>();
        serviceCollection.AddSingleton<IJellyfinLibraryService, JellyfinLibraryService>();
        serviceCollection.AddSingleton<IDownloadService, DownloadService>();
        serviceCollection.AddHostedService<DownloadMonitorService>();
    }

    private static HttpMessageHandler CreateSecureHandler() => new SocketsHttpHandler
    {
        AllowAutoRedirect = false,
        AutomaticDecompression = System.Net.DecompressionMethods.GZip
            | System.Net.DecompressionMethods.Deflate,
        ConnectTimeout = TimeSpan.FromSeconds(10),
        PooledConnectionLifetime = TimeSpan.FromMinutes(5),
        UseCookies = false
    };

    // Posters come from hosts chosen by TorrentClaw, so every connection is checked against private ranges.
    // The proxy is bypassed because a proxy would hide the real destination from that check.
    private static HttpMessageHandler CreatePosterHandler() => new SocketsHttpHandler
    {
        AllowAutoRedirect = false,
        AutomaticDecompression = System.Net.DecompressionMethods.None,
        ConnectTimeout = TimeSpan.FromSeconds(10),
        PooledConnectionLifetime = TimeSpan.FromMinutes(5),
        UseCookies = false,
        UseProxy = false,
        ConnectCallback = PublicNetworkConnector.ConnectAsync
    };
}
