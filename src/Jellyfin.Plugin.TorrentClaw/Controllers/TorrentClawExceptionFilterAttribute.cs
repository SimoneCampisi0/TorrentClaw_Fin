using System.Net;
using Jellyfin.Plugin.TorrentClaw.Clients;
using Jellyfin.Plugin.TorrentClaw.Configuration;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Jellyfin.Plugin.TorrentClaw.Controllers;

/// <summary>
/// Converts known plugin failures into ProblemDetails. Jellyfin's global exception middleware replaces every
/// message with a generic text outside Development, which would leave the pages without actionable feedback.
/// Only messages authored by this plugin are forwarded; they never contain secrets, magnets or info hashes.
/// </summary>
[AttributeUsage(AttributeTargets.Class)]
public sealed class TorrentClawExceptionFilterAttribute : ExceptionFilterAttribute
{
    public override void OnException(ExceptionContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        var problem = CreateProblem(context.Exception, context.HttpContext.RequestAborted);
        if (problem is null)
        {
            return;
        }

        var result = new ObjectResult(problem) { StatusCode = problem.Status };
        result.ContentTypes.Add("application/problem+json");
        context.Result = result;
        context.ExceptionHandled = true;
    }

    public static ProblemDetails? CreateProblem(Exception exception, CancellationToken requestAborted) => exception switch
    {
        TorrentClawApiException apiException => Problem(
            StatusCodes.Status502BadGateway,
            "TorrentClaw ha rifiutato la richiesta",
            DescribeTorrentClawStatus(apiException.StatusCode)),
        TorrentClawProtocolException => Problem(
            StatusCodes.Status502BadGateway,
            "Risposta TorrentClaw non valida",
            "TorrentClaw ha restituito una risposta inattesa."),
        QbittorrentAuthenticationException => Problem(
            StatusCodes.Status502BadGateway,
            "Accesso a qBittorrent non riuscito",
            "qBittorrent ha rifiutato le credenziali configurate."),
        QbittorrentProtocolException => Problem(
            StatusCodes.Status502BadGateway,
            "Risposta qBittorrent non valida",
            "qBittorrent ha restituito una risposta inattesa."),
        HttpRequestException => Problem(
            StatusCodes.Status502BadGateway,
            "Servizio esterno non raggiungibile",
            "Il servizio esterno non è raggiungibile. Verifica URL e connessione."),
        OperationCanceledException when !requestAborted.IsCancellationRequested => Problem(
            StatusCodes.Status504GatewayTimeout,
            "Tempo scaduto",
            "Il servizio esterno non ha risposto in tempo."),
        TorrentClawConfigurationException configurationException => Problem(
            StatusCodes.Status400BadRequest,
            "Configurazione incompleta",
            configurationException.Message),
        KeyNotFoundException notFound => Problem(
            StatusCodes.Status404NotFound,
            "Elemento non trovato",
            notFound.Message),
        // A null argument signals a plugin defect, not invalid user input: Jellyfin logs it with the stack trace.
        ArgumentNullException => null,
        ArgumentException argumentException => Problem(
            StatusCodes.Status400BadRequest,
            "Richiesta non valida",
            WithoutParameterName(argumentException)),
        InvalidDataException invalidData => Problem(
            StatusCodes.Status422UnprocessableEntity,
            "Dati della release non validi",
            invalidData.Message),
        DirectoryNotFoundException directoryNotFound => Problem(
            StatusCodes.Status409Conflict,
            "Directory non disponibile",
            directoryNotFound.Message),
        IOException ioException => Problem(
            StatusCodes.Status409Conflict,
            "Conflitto sul disco",
            ioException.Message),
        InvalidOperationException invalidOperation => Problem(
            StatusCodes.Status409Conflict,
            "Operazione non consentita",
            invalidOperation.Message),
        _ => null
    };

    private static ProblemDetails Problem(int status, string title, string detail) => new()
    {
        Status = status,
        Title = title,
        Detail = detail
    };

    private static string DescribeTorrentClawStatus(HttpStatusCode statusCode) => statusCode switch
    {
        HttpStatusCode.Unauthorized => "La API key TorrentClaw non è valida.",
        HttpStatusCode.Forbidden => "La API key TorrentClaw non è autorizzata.",
        HttpStatusCode.TooManyRequests => "Limite di richieste TorrentClaw raggiunto. Riprova tra poco.",
        >= HttpStatusCode.InternalServerError => "TorrentClaw è temporaneamente non disponibile.",
        _ => $"TorrentClaw ha risposto con HTTP {(int)statusCode}."
    };

    private static string WithoutParameterName(ArgumentException exception) =>
        exception.ParamName is null
            ? exception.Message
            : exception.Message.Replace($" (Parameter '{exception.ParamName}')", string.Empty, StringComparison.Ordinal);
}
