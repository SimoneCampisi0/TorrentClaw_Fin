using Jellyfin.Plugin.TorrentClaw.Models;

namespace Jellyfin.Plugin.TorrentClaw.Services;

public interface IReleaseRankingService
{
    ReleaseResult Rank(
        string releaseId,
        string title,
        ContentKind contentType,
        TorrentClawTorrent torrent,
        ReleaseSearchRequest request);
}

public sealed class ReleaseRankingService : IReleaseRankingService
{
    private static readonly char[] LanguageSeparators = [',', ';', '+', ' '];
    private static readonly char[] TitleSeparators = ['.', '-', '_', ' ', '[', ']', '(', ')', '{', '}'];

    public ReleaseResult Rank(
        string releaseId,
        string title,
        ContentKind contentType,
        TorrentClawTorrent torrent,
        ReleaseSearchRequest request)
    {
        var satisfied = new List<string>();
        var violated = new List<string>();
        var matches = new List<string>();
        var warnings = new List<string>();

        var audioLanguages = DetectAudioLanguages(torrent);
        var subtitleLanguages = DetectSubtitleLanguages(torrent);
        EvaluateLanguage(
            audioLanguages,
            request.AudioLanguage ?? request.Language,
            "audio language",
            allowNone: false,
            satisfied,
            violated);
        EvaluateLanguage(
            subtitleLanguages,
            request.SubtitleLanguage,
            "subtitle language",
            allowNone: true,
            satisfied,
            violated);
        EvaluateSize(torrent, request, satisfied, violated, warnings);
        EvaluateSeeders(torrent, request, satisfied, violated);

        var score = torrent.QualityScore ?? 0;
        score += Match(torrent.Quality, request.Resolution, "resolution", matches, 20);
        score += Match(NormalizeCodec(torrent.Codec ?? torrent.VideoInfo?.Codec), NormalizeCodec(request.Codec), "codec", matches, 15);
        score += Match(NormalizeHdr(torrent.HdrType ?? torrent.VideoInfo?.Hdr), NormalizeHdr(request.Hdr), "HDR", matches, 15);
        if (request.PreferRemux && torrent.RawTitle.Contains("REMUX", StringComparison.OrdinalIgnoreCase))
        {
            score += 10;
            matches.Add("REMUX");
        }

        if (string.IsNullOrWhiteSpace(torrent.MagnetUrl))
        {
            violated.Add("magnet unavailable");
        }

        if (!string.IsNullOrWhiteSpace(torrent.ThreatLevel)
            && !torrent.ThreatLevel.Equals("none", StringComparison.OrdinalIgnoreCase)
            && !torrent.ThreatLevel.Equals("safe", StringComparison.OrdinalIgnoreCase))
        {
            warnings.Add($"Threat level: {torrent.ThreatLevel}");
        }

        if (string.IsNullOrWhiteSpace(torrent.Quality))
        {
            warnings.Add("Resolution metadata unavailable");
        }

        var hdr = torrent.HdrType ?? torrent.VideoInfo?.Hdr;
        return new ReleaseResult
        {
            ReleaseId = releaseId,
            Title = title,
            ReleaseName = string.IsNullOrWhiteSpace(torrent.RawTitle) ? title : torrent.RawTitle,
            ContentType = contentType,
            Source = torrent.Source,
            Resolution = torrent.Quality,
            Codec = torrent.Codec ?? torrent.VideoInfo?.Codec,
            Hdr = hdr,
            DolbyVision = NormalizeHdr(hdr) == "dolbyvision",
            Audio = torrent.AudioCodec,
            AudioTracks = torrent.AudioTracks,
            SubtitleTracks = torrent.SubtitleTracks,
            AudioLanguages = audioLanguages.Languages,
            SubtitleLanguages = subtitleLanguages.Languages,
            AudioLanguageSource = audioLanguages.Source,
            SubtitleLanguageSource = subtitleLanguages.Source,
            Languages = torrent.Languages,
            SizeBytes = torrent.SizeBytes,
            Seeders = torrent.Seeders,
            Leechers = torrent.Leechers,
            TrueSpec = torrent.ScanStatus?.Equals("completed", StringComparison.OrdinalIgnoreCase) == true
                || torrent.AudioTracks.Count > 0
                || torrent.SubtitleTracks.Count > 0,
            TorrentClawScore = torrent.QualityScore,
            CompatibilityScore = Math.Clamp(score, 0, 200),
            Eligible = violated.Count == 0,
            ConstraintsSatisfied = satisfied,
            ConstraintsViolated = violated,
            PreferenceMatches = matches,
            Warnings = warnings
        };
    }

    public static string? NormalizeCodec(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var normalized = value.Replace(".", string.Empty, StringComparison.Ordinal)
            .Replace("-", string.Empty, StringComparison.Ordinal)
            .Replace("/", string.Empty, StringComparison.Ordinal)
            .Replace(" ", string.Empty, StringComparison.Ordinal)
            .ToLowerInvariant();
        return normalized switch
        {
            "h264" or "avc" or "x264" => "avc",
            "h265" or "hevc" or "x265" => "hevc",
            "av1" => "av1",
            _ => normalized
        };
    }

    public static string? NormalizeHdr(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Replace("_", string.Empty, StringComparison.Ordinal)
            .Replace(" ", string.Empty, StringComparison.Ordinal)
            .Replace("+", "plus", StringComparison.Ordinal)
            .ToLowerInvariant() switch
        {
            "dv" or "dovi" or "dolbyvision" => "dolbyvision",
            "hdr10plus" => "hdr10plus",
            "hdr10" => "hdr10",
            "sdr" => "sdr",
            var other => other
        };
    }

    public static string? NormalizeLanguage(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim().ToLowerInvariant() switch
        {
            "it" or "ita" or "italian" or "italiano" => "it",
            "en" or "eng" or "english" or "inglese" => "en",
            "es" or "spa" or "spanish" or "espanol" or "spagnolo" => "es",
            "fr" or "fre" or "fra" or "french" or "francais" or "francese" => "fr",
            "de" or "deu" or "ger" or "german" or "deutsch" or "tedesco" => "de",
            "ja" or "jpn" or "japanese" or "giapponese" => "ja",
            "pt" or "por" or "portuguese" or "portoghese" => "pt",
            "ru" or "rus" or "russian" or "russo" => "ru",
            "und" or "unknown" => null,
            var language => language
        };
    }

    private static void EvaluateLanguage(
        LanguageEvidence evidence,
        string? requested,
        string label,
        bool allowNone,
        List<string> satisfied,
        List<string> violated)
    {
        if (string.IsNullOrWhiteSpace(requested))
        {
            return;
        }

        if (allowNone && requested.Trim().Equals("none", StringComparison.OrdinalIgnoreCase))
        {
            if (evidence.Source == "TrueSpec" && evidence.Languages.Count == 0)
            {
                satisfied.Add("no subtitles (TrueSpec)");
            }
            else
            {
                violated.Add(evidence.Source == "Unknown" ? "no subtitles (metadata unavailable)" : "no subtitles");
            }

            return;
        }

        var requestedLanguages = requested.Split(
                LanguageSeparators,
                StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(NormalizeLanguage)
            .Where(value => value is not null)
            .Cast<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        if (requestedLanguages.Length == 0)
        {
            return;
        }

        if (requestedLanguages.All(requestedLanguage =>
                evidence.Languages.Any(actualLanguage => LanguageMatches(actualLanguage, requestedLanguage))))
        {
            satisfied.Add($"requested {label}");
        }
        else
        {
            violated.Add(evidence.Source == "Unknown"
                ? $"requested {label} (metadata unavailable)"
                : $"requested {label}");
        }
    }

    private static bool LanguageMatches(string actual, string requested)
    {
        var a = NormalizeLanguage(actual);
        var r = NormalizeLanguage(requested);
        return a is not null && r is not null && a.Equals(r, StringComparison.OrdinalIgnoreCase);
    }

    private static LanguageEvidence DetectAudioLanguages(TorrentClawTorrent torrent)
    {
        var trueSpec = NormalizeLanguages(torrent.AudioTracks.Select(track => track.Lang));
        if (trueSpec.Length > 0)
        {
            return new LanguageEvidence(trueSpec, "TrueSpec");
        }

        var metadata = NormalizeLanguages(torrent.Languages);
        if (metadata.Length > 0)
        {
            return new LanguageEvidence(metadata, "Metadata");
        }

        var inferred = InferTitleLanguages(torrent.RawTitle).Audio;
        return inferred.Length > 0
            ? new LanguageEvidence(inferred, "Inferred")
            : new LanguageEvidence([], "Unknown");
    }

    private static LanguageEvidence DetectSubtitleLanguages(TorrentClawTorrent torrent)
    {
        var trueSpec = NormalizeLanguages(torrent.SubtitleTracks.Select(track => track.Lang));
        if (trueSpec.Length > 0)
        {
            return new LanguageEvidence(trueSpec, "TrueSpec");
        }

        var metadata = NormalizeLanguages(torrent.SubtitleLanguages);
        if (metadata.Length > 0)
        {
            return new LanguageEvidence(metadata, "Metadata");
        }

        if (torrent.ScanStatus?.Equals("completed", StringComparison.OrdinalIgnoreCase) == true)
        {
            return new LanguageEvidence([], "TrueSpec");
        }

        var inferred = InferTitleLanguages(torrent.RawTitle).Subtitles;
        return inferred.Length > 0
            ? new LanguageEvidence(inferred, "Inferred")
            : new LanguageEvidence([], "Unknown");
    }

    private static string[] NormalizeLanguages(IEnumerable<string> languages) => languages
        .Select(NormalizeLanguage)
        .Where(value => value is not null)
        .Cast<string>()
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToArray();

    private static InferredLanguages InferTitleLanguages(string title)
    {
        var audio = new List<string>();
        var subtitles = new List<string>();
        var subtitleMode = false;
        foreach (var rawToken in title.Split(
                     TitleSeparators,
                     StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var token = rawToken.ToLowerInvariant();
            if (token.StartsWith("sub", StringComparison.Ordinal))
            {
                subtitleMode = true;
                var suffix = token.TrimStart('s', 'u', 'b');
                var suffixLanguage = NormalizeKnownLanguage(suffix);
                if (suffixLanguage is not null)
                {
                    subtitles.Add(suffixLanguage);
                }

                continue;
            }

            var language = NormalizeKnownLanguage(token);
            if (language is null)
            {
                continue;
            }

            (subtitleMode ? subtitles : audio).Add(language);
        }

        return new InferredLanguages(NormalizeLanguages(audio), NormalizeLanguages(subtitles));
    }

    private static string? NormalizeKnownLanguage(string value)
    {
        var normalized = NormalizeLanguage(value);
        return normalized is "it" or "en" or "es" or "fr" or "de" or "ja" or "pt" or "ru"
            ? normalized
            : null;
    }

    private static void EvaluateSize(
        TorrentClawTorrent torrent,
        ReleaseSearchRequest request,
        List<string> satisfied,
        List<string> violated,
        List<string> warnings)
    {
        if (request.MaxSizeGb is not > 0)
        {
            return;
        }

        if (torrent.SizeBytes is null)
        {
            violated.Add("maximum size (metadata unavailable)");
            warnings.Add("Size metadata unavailable");
        }
        else if (torrent.SizeBytes <= request.MaxSizeGb * 1024 * 1024 * 1024)
        {
            satisfied.Add("maximum size");
        }
        else
        {
            violated.Add("maximum size");
        }
    }

    private static void EvaluateSeeders(
        TorrentClawTorrent torrent,
        ReleaseSearchRequest request,
        List<string> satisfied,
        List<string> violated)
    {
        if (request.MinimumSeeders is not > 0)
        {
            return;
        }

        if (torrent.Seeders >= request.MinimumSeeders)
        {
            satisfied.Add("minimum seeders");
        }
        else
        {
            violated.Add("minimum seeders");
        }
    }

    private static int Match(string? actual, string? requested, string label, List<string> matches, int points)
    {
        if (string.IsNullOrWhiteSpace(requested))
        {
            return 0;
        }

        if (string.Equals(actual, requested, StringComparison.OrdinalIgnoreCase))
        {
            matches.Add(label);
            return points;
        }

        return 0;
    }

    private sealed record LanguageEvidence(IReadOnlyList<string> Languages, string Source);

    private sealed record InferredLanguages(string[] Audio, string[] Subtitles);
}
