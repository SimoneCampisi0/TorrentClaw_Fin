using System.Reflection;
using System.Text.Json;
using Jellyfin.Plugin.TorrentClaw.Clients;
using Jellyfin.Plugin.TorrentClaw.Configuration;
using Jellyfin.Plugin.TorrentClaw.Controllers;
using Jellyfin.Plugin.TorrentClaw.Models;
using Jellyfin.Plugin.TorrentClaw.Services;
using MediaBrowser.Common.Api;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;

namespace Jellyfin.Plugin.TorrentClaw.Tests;

public sealed class ControllerContractTests
{
    private static readonly Dictionary<Type, string[]> ExpectedEndpoints = new()
    {
        [typeof(SearchController)] =
        [
            "POST TorrentClaw/Search",
            "GET TorrentClaw/Search/{releaseId}/Poster",
            "GET TorrentClaw/Search/{releaseId}/Magnet"
        ],
        [typeof(DownloadsController)] =
        [
            "POST TorrentClaw/Downloads",
            "POST TorrentClaw/Downloads/Preflight",
            "POST TorrentClaw/Downloads/Preflight/{releaseId}/Confirm",
            "DELETE TorrentClaw/Downloads/Preflight/{releaseId}",
            "GET TorrentClaw/Downloads",
            "POST TorrentClaw/Downloads/{id:guid}/Pause",
            "POST TorrentClaw/Downloads/{id:guid}/Resume",
            "DELETE TorrentClaw/Downloads/{id:guid}"
        ],
        [typeof(ConfigurationController)] =
        [
            "GET TorrentClaw/Configuration",
            "POST TorrentClaw/Configuration",
            "POST TorrentClaw/Connections/TorrentClaw/Test",
            "POST TorrentClaw/Connections/Qbittorrent/Test"
        ]
    };

    public static TheoryData<Type> Controllers => new()
    {
        typeof(SearchController),
        typeof(DownloadsController),
        typeof(ConfigurationController)
    };

    [Fact]
    public void PluginContainsExactlyThreeControllers()
    {
        var controllers = typeof(Plugin).Assembly.GetTypes()
            .Where(type => typeof(ControllerBase).IsAssignableFrom(type) && !type.IsAbstract)
            .OrderBy(type => type.Name, StringComparer.Ordinal);

        Assert.Equal([typeof(ConfigurationController), typeof(DownloadsController), typeof(SearchController)], controllers);
    }

    [Theory]
    [MemberData(nameof(Controllers))]
    public void ControllerExposesOnlyTheEndpointsOfItsArea(Type controller)
    {
        var publicMethods = controller.GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.DeclaredOnly);

        Assert.All(publicMethods, method => Assert.NotEmpty(method.GetCustomAttributes<HttpMethodAttribute>()));
        Assert.Equal(
            ExpectedEndpoints[controller].Order(StringComparer.Ordinal),
            GetEndpoints(controller).Order(StringComparer.Ordinal));
    }

    [Theory]
    [MemberData(nameof(Controllers))]
    public void ControllerRequiresAdministratorElevation(Type controller)
    {
        var authorize = controller.GetCustomAttribute<AuthorizeAttribute>();

        Assert.NotNull(authorize);
        Assert.Equal(Policies.RequiresElevation, authorize.Policy);
        Assert.NotNull(controller.GetCustomAttribute<ApiControllerAttribute>());
        Assert.NotNull(controller.GetCustomAttribute<TorrentClawExceptionFilterAttribute>());
        Assert.DoesNotContain(GetActions(controller), action => action.GetCustomAttribute<AllowAnonymousAttribute>() is not null);
    }

    [Theory]
    [MemberData(nameof(Controllers))]
    public void EveryActionDeclaresExplicitResponseTypes(Type controller)
    {
        Assert.All(GetActions(controller), action =>
            Assert.NotEmpty(action.GetCustomAttributes<ProducesResponseTypeAttribute>()));
    }

    [Fact]
    public void ControllersDependOnlyOnTheServicesOfTheirArea()
    {
        Assert.Equal([typeof(ISearchService), typeof(IPosterService)], ConstructorDependencies<SearchController>());
        Assert.Equal([typeof(IDownloadService)], ConstructorDependencies<DownloadsController>());
        Assert.Equal(
            [typeof(IPluginConfigurationStore), typeof(ITorrentClawClient), typeof(IQbittorrentClient)],
            ConstructorDependencies<ConfigurationController>());
    }

    [Fact]
    public void ConfigurationGetNeverReturnsSecretValues()
    {
        var store = new InMemoryConfigurationStore(new PluginConfiguration
        {
            TorrentClawApiKey = "tc_test_dummy_key",
            QbittorrentPassword = "qb_test_dummy_password"
        });
        var controller = new ConfigurationController(store, new UnusedTorrentClawClient(), new UnusedQbittorrentClient());

        var view = controller.GetConfiguration().Value;
        var json = JsonSerializer.Serialize(view);

        Assert.NotNull(view);
        Assert.True(view.TorrentClawApiKeyConfigured);
        Assert.True(view.QbittorrentPasswordConfigured);
        Assert.DoesNotContain("tc_test_dummy_key", json, StringComparison.Ordinal);
        Assert.DoesNotContain("qb_test_dummy_password", json, StringComparison.Ordinal);
    }

    [Fact]
    public void ConfigurationPostWithBlankSecretsPreservesStoredSecrets()
    {
        var store = new InMemoryConfigurationStore(new PluginConfiguration
        {
            TorrentClawApiKey = "tc_test_dummy_key",
            QbittorrentPassword = "qb_test_dummy_password"
        });
        var controller = new ConfigurationController(store, new UnusedTorrentClawClient(), new UnusedQbittorrentClient());

        var result = controller.UpdateConfiguration(new ConfigurationUpdate
        {
            TorrentClawBaseUrl = "https://torrentclaw.com",
            TorrentClawApiKey = "   ",
            QbittorrentBaseUrl = "http://127.0.0.1:8080",
            QbittorrentPassword = null
        });

        Assert.IsType<NoContentResult>(result);
        Assert.Equal("tc_test_dummy_key", store.Saved?.TorrentClawApiKey);
        Assert.Equal("qb_test_dummy_password", store.Saved?.QbittorrentPassword);
    }

    [Theory]
    [InlineData("not-an-id")]
    [InlineData("0123456789ABCDEF0123456789ABCDEF")]
    [InlineData("..%2F..%2Fetc")]
    public async Task PosterEndpointRejectsMalformedReleaseIdsWithoutCallingTheService(string releaseId)
    {
        var posters = new RecordingPosterService(null);
        var controller = CreateSearchController(posters);

        var result = await controller.GetPoster(releaseId, CancellationToken.None);

        Assert.IsType<NotFoundResult>(result);
        Assert.Equal(0, posters.RequestCount);
    }

    [Fact]
    public async Task PosterEndpointReturnsImageWithSafeHeaders()
    {
        var image = new PosterImage([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], "image/png");
        var controller = CreateSearchController(new RecordingPosterService(image));

        var result = await controller.GetPoster(new string('a', 32), CancellationToken.None);

        var file = Assert.IsType<FileContentResult>(result);
        Assert.Equal("image/png", file.ContentType);
        Assert.Equal("nosniff", controller.Response.Headers.XContentTypeOptions.ToString());
        Assert.StartsWith("private", controller.Response.Headers.CacheControl.ToString(), StringComparison.Ordinal);
    }

    private static SearchController CreateSearchController(IPosterService posters) => new(new UnusedSearchService(), posters)
    {
        ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
    };

    private static Type[] ConstructorDependencies<TController>() =>
        typeof(TController).GetConstructors().Single().GetParameters().Select(parameter => parameter.ParameterType).ToArray();

    private static IEnumerable<MethodInfo> GetActions(Type controller) =>
        controller.GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.DeclaredOnly)
            .Where(method => method.GetCustomAttributes<HttpMethodAttribute>().Any());

    private static IEnumerable<string> GetEndpoints(Type controller)
    {
        var prefix = controller.GetCustomAttribute<RouteAttribute>()!.Template;
        return GetActions(controller).SelectMany(action => action.GetCustomAttributes<HttpMethodAttribute>()
            .Select(attribute => string.IsNullOrEmpty(attribute.Template)
                ? $"{attribute.HttpMethods.Single()} {prefix}"
                : $"{attribute.HttpMethods.Single()} {prefix}/{attribute.Template}"));
    }

    private sealed class InMemoryConfigurationStore(PluginConfiguration configuration) : IPluginConfigurationStore
    {
        public PluginConfiguration? Saved { get; private set; }

        public PluginConfiguration Load() => Saved ?? configuration;

        public void Save(PluginConfiguration updated) => Saved = updated;
    }

    private sealed class RecordingPosterService(PosterImage? image) : IPosterService
    {
        public int RequestCount { get; private set; }

        public bool RegisterPoster(string releaseId, string? posterUrl) => false;

        public Task<PosterImage?> GetPosterAsync(string releaseId, CancellationToken cancellationToken)
        {
            RequestCount++;
            return Task.FromResult(image);
        }
    }

    private sealed class UnusedSearchService : ISearchService
    {
        public Task<IReadOnlyList<ReleaseResult>> SearchAsync(ReleaseSearchRequest request, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("Search must not be called.");

        public bool TryResolveRelease(string releaseId, out SelectedRelease? release) =>
            throw new InvalidOperationException("Search must not be called.");
    }

    private sealed class UnusedTorrentClawClient : ITorrentClawClient
    {
        public Task<TorrentClawSearchResponse> SearchAsync(ReleaseSearchRequest request, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("TorrentClaw must not be called.");

        public Task<ConnectionTestResult> TestConnectionAsync(CancellationToken cancellationToken) =>
            throw new InvalidOperationException("TorrentClaw must not be called.");
    }

    private sealed class UnusedQbittorrentClient : IQbittorrentClient
    {
        public Task AuthenticateAsync(CancellationToken cancellationToken) => Unused();

        public Task AddTorrentAsync(string magnetUrl, string category, string savePath, CancellationToken cancellationToken) => Unused();

        public Task AddMetadataPreflightAsync(
            string magnetUrl,
            string category,
            string savePath,
            CancellationToken cancellationToken) => Unused();

        public Task<TorrentStatus?> GetTorrentStatusAsync(string hash, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("qBittorrent must not be called.");

        public Task PauseAsync(string hash, CancellationToken cancellationToken) => Unused();

        public Task ResumeAsync(string hash, CancellationToken cancellationToken) => Unused();

        public Task DeleteTorrentAsync(string hash, bool deleteFiles, CancellationToken cancellationToken) => Unused();

        public Task<ConnectionTestResult> TestConnectionAsync(CancellationToken cancellationToken) =>
            throw new InvalidOperationException("qBittorrent must not be called.");

        private static Task Unused() => throw new InvalidOperationException("qBittorrent must not be called.");
    }
}
