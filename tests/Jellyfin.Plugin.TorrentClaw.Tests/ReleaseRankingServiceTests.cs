using Jellyfin.Plugin.TorrentClaw.Models;
using Jellyfin.Plugin.TorrentClaw.Services;

namespace Jellyfin.Plugin.TorrentClaw.Tests;

public sealed class ReleaseRankingServiceTests
{
    private readonly ReleaseRankingService _service = new();

    [Fact]
    public void HardConstraintsAreAppliedAndExplained()
    {
        var torrent = CreateTorrent() with { Languages = ["en"], SizeBytes = 40L * 1024 * 1024 * 1024, Seeders = 2 };
        var request = new ReleaseSearchRequest
        {
            Query = "Title",
            AudioLanguage = "it",
            MaxSizeGb = 30,
            MinimumSeeders = 5
        };

        var result = _service.Rank("id", "Title", ContentKind.Movie, torrent, request);

        Assert.False(result.Eligible);
        Assert.Contains("requested audio language", result.ConstraintsViolated);
        Assert.DoesNotContain("maximum size", result.ConstraintsViolated);
        Assert.Contains("Source-reported size exceeds the limit; verify before download", result.Warnings);
        Assert.Contains("minimum seeders", result.ConstraintsViolated);
    }

    [Fact]
    public void PreferencesIncreaseDeterministicScore()
    {
        var request = new ReleaseSearchRequest
        {
            Query = "Title",
            Resolution = "2160p",
            Codec = "H.265",
            Hdr = "HDR10+",
            PreferRemux = true
        };
        var torrent = CreateTorrent() with
        {
            RawTitle = "Title.2160p.REMUX",
            Quality = "2160p",
            Codec = "HEVC",
            HdrType = "hdr10_plus",
            QualityScore = 50
        };

        var result = _service.Rank("id", "Title", ContentKind.Movie, torrent, request);

        Assert.Equal(110, result.CompatibilityScore);
        Assert.Equal(["resolution", "codec", "HDR", "REMUX"], result.PreferenceMatches);
    }

    [Theory]
    [InlineData("H.264", "avc")]
    [InlineData("x265", "hevc")]
    [InlineData("AV1", "av1")]
    public void CodecNormalizationWorks(string input, string expected) =>
        Assert.Equal(expected, ReleaseRankingService.NormalizeCodec(input));

    [Theory]
    [InlineData("HDR10+", "hdr10plus")]
    [InlineData("dolby_vision", "dolbyvision")]
    [InlineData("DV", "dolbyvision")]
    public void HdrNormalizationWorks(string input, string expected) =>
        Assert.Equal(expected, ReleaseRankingService.NormalizeHdr(input));

    [Fact]
    public void MissingSizeMetadataIsDeferredToPreflight()
    {
        var result = _service.Rank(
            "id",
            "Title",
            ContentKind.Movie,
            CreateTorrent() with { SizeBytes = null },
            new ReleaseSearchRequest { Query = "Title", MaxSizeGb = 30 });

        Assert.True(result.Eligible);
        Assert.Contains("Size must be verified from torrent metadata", result.Warnings);
    }

    [Fact]
    public void MissingOptionalMetadataDoesNotCrash()
    {
        var torrent = CreateTorrent() with
        {
            Quality = null,
            Codec = null,
            HdrType = null,
            VideoInfo = null,
            AudioCodec = null,
            QualityScore = null,
            Languages = []
        };

        var result = _service.Rank(
            "id",
            "Title",
            ContentKind.Show,
            torrent,
            new ReleaseSearchRequest { Query = "Title" });

        Assert.True(result.Eligible);
        Assert.Contains("Resolution metadata unavailable", result.Warnings);
    }

    [Fact]
    public void TrueSpecAudioAndSubtitleTracksAreFilteredIndependently()
    {
        var torrent = CreateTorrent() with
        {
            Languages = ["en"],
            AudioTracks = [new TorrentClawAudioTrack { Lang = "ita", Codec = "EAC3", Channels = 6 }],
            SubtitleTracks = [new TorrentClawSubtitleTrack { Lang = "eng", Codec = "subrip", Forced = true }],
            ScanStatus = "completed"
        };
        var result = _service.Rank(
            "id",
            "Title",
            ContentKind.Movie,
            torrent,
            new ReleaseSearchRequest { Query = "Title", AudioLanguage = "it", SubtitleLanguage = "it" });

        Assert.False(result.Eligible);
        Assert.Contains("requested audio language", result.ConstraintsSatisfied);
        Assert.Contains("requested subtitle language", result.ConstraintsViolated);
        Assert.Equal(["it"], result.AudioLanguages);
        Assert.Equal(["en"], result.SubtitleLanguages);
        Assert.Equal("TrueSpec", result.AudioLanguageSource);
        Assert.Equal("TrueSpec", result.SubtitleLanguageSource);
        Assert.True(result.TrueSpec);
    }

    [Fact]
    public void MultipleRequestedLanguagesMustAllBePresent()
    {
        var torrent = CreateTorrent() with
        {
            AudioTracks =
            [
                new TorrentClawAudioTrack { Lang = "ita", Codec = "AC3" },
                new TorrentClawAudioTrack { Lang = "eng", Codec = "AAC" }
            ],
            SubtitleLanguages = ["ita", "eng"]
        };
        var result = _service.Rank(
            "id",
            "Title",
            ContentKind.Movie,
            torrent,
            new ReleaseSearchRequest { Query = "Title", AudioLanguage = "it,en", SubtitleLanguage = "it,en" });

        Assert.True(result.Eligible);
        Assert.Equal(["it", "en"], result.AudioLanguages);
        Assert.Equal(["it", "en"], result.SubtitleLanguages);
    }

    [Fact]
    public void ReleaseNameInferenceDoesNotMixSubtitleLanguageIntoAudio()
    {
        var torrent = CreateTorrent() with
        {
            RawTitle = "Movie.1080p.ITA.ENG.SUB.ITA.x265",
            Languages = []
        };
        var result = _service.Rank(
            "id",
            "Title",
            ContentKind.Movie,
            torrent,
            new ReleaseSearchRequest { Query = "Title" });

        Assert.Equal(["it", "en"], result.AudioLanguages);
        Assert.Equal(["it"], result.SubtitleLanguages);
        Assert.Equal("Inferred", result.AudioLanguageSource);
        Assert.Equal("Inferred", result.SubtitleLanguageSource);
    }

    [Fact]
    public void NoSubtitleConstraintRequiresTrueSpecConfirmation()
    {
        var verified = _service.Rank(
            "verified",
            "Title",
            ContentKind.Movie,
            CreateTorrent() with { ScanStatus = "completed", SubtitleTracks = [], SubtitleLanguages = [] },
            new ReleaseSearchRequest { Query = "Title", SubtitleLanguage = "none" });
        var unknown = _service.Rank(
            "unknown",
            "Title",
            ContentKind.Movie,
            CreateTorrent() with { ScanStatus = null, SubtitleTracks = [], SubtitleLanguages = [] },
            new ReleaseSearchRequest { Query = "Title", SubtitleLanguage = "none" });

        Assert.True(verified.Eligible);
        Assert.Contains("no subtitles (TrueSpec)", verified.ConstraintsSatisfied);
        Assert.False(unknown.Eligible);
        Assert.Contains("no subtitles (metadata unavailable)", unknown.ConstraintsViolated);
    }

    private static TorrentClawTorrent CreateTorrent() => new()
    {
        InfoHash = "0123456789abcdef0123456789abcdef01234567",
        RawTitle = "Title.1080p",
        Quality = "1080p",
        Codec = "AVC",
        SizeBytes = 10L * 1024 * 1024 * 1024,
        Seeders = 10,
        MagnetUrl = "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567",
        Source = "test",
        Languages = ["it"]
    };
}
