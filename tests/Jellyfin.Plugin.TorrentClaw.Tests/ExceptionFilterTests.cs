using System.Net;
using Jellyfin.Plugin.TorrentClaw.Clients;
using Jellyfin.Plugin.TorrentClaw.Configuration;
using Jellyfin.Plugin.TorrentClaw.Controllers;
using Microsoft.AspNetCore.Http;

namespace Jellyfin.Plugin.TorrentClaw.Tests;

public sealed class ExceptionFilterTests
{
    [Fact]
    public void UnauthorizedTorrentClawResponseBecomesReadableBadGateway()
    {
        var problem = TorrentClawExceptionFilterAttribute.CreateProblem(
            new TorrentClawApiException(HttpStatusCode.Unauthorized),
            CancellationToken.None);

        Assert.NotNull(problem);
        Assert.Equal(StatusCodes.Status502BadGateway, problem.Status);
        Assert.Contains("API key", problem.Detail, StringComparison.Ordinal);
    }

    [Fact]
    public void ExpiredReleaseBecomesNotFound()
    {
        var problem = TorrentClawExceptionFilterAttribute.CreateProblem(
            new KeyNotFoundException("Release expired or was not produced by the latest search."),
            CancellationToken.None);

        Assert.Equal(StatusCodes.Status404NotFound, problem?.Status);
    }

    [Fact]
    public void ArgumentMessagesDropTheParameterName()
    {
        var problem = TorrentClawExceptionFilterAttribute.CreateProblem(
            new ArgumentException("TorrentClaw Base URL must use HTTPS.", "value"),
            CancellationToken.None);

        Assert.Equal(StatusCodes.Status400BadRequest, problem?.Status);
        Assert.Equal("TorrentClaw Base URL must use HTTPS.", problem?.Detail);
    }

    [Fact]
    public void InternalNullArgumentsAreNotReportedAsInvalidRequests()
    {
        Assert.Null(TorrentClawExceptionFilterAttribute.CreateProblem(
            new ArgumentNullException("source"),
            CancellationToken.None));
    }

    [Fact]
    public void ConfigurationErrorsAreNotReportedAsConflicts()
    {
        var problem = TorrentClawExceptionFilterAttribute.CreateProblem(
            new TorrentClawConfigurationException("TorrentClaw API key is not configured in Jellyfin."),
            CancellationToken.None);

        Assert.Equal(StatusCodes.Status400BadRequest, problem?.Status);
    }

    [Fact]
    public void TransportMessagesAreReplacedByGenericText()
    {
        var problem = TorrentClawExceptionFilterAttribute.CreateProblem(
            new HttpRequestException("Connection to 10.0.0.5:8080 refused"),
            CancellationToken.None);

        Assert.Equal(StatusCodes.Status502BadGateway, problem?.Status);
        Assert.DoesNotContain("10.0.0.5", problem?.Detail, StringComparison.Ordinal);
    }

    [Fact]
    public void UnknownFailuresAndClientDisconnectsAreLeftToJellyfin()
    {
        using var aborted = new CancellationTokenSource();
        aborted.Cancel();

        Assert.Null(TorrentClawExceptionFilterAttribute.CreateProblem(new FormatException(), CancellationToken.None));
        Assert.Null(TorrentClawExceptionFilterAttribute.CreateProblem(new OperationCanceledException(), aborted.Token));
    }
}
