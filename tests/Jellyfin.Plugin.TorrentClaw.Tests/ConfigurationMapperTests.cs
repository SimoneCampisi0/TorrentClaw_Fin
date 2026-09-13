using System.Text.Json;
using System.Xml;
using System.Xml.Serialization;
using Jellyfin.Plugin.TorrentClaw.Configuration;
using Jellyfin.Plugin.TorrentClaw.Models;

namespace Jellyfin.Plugin.TorrentClaw.Tests;

public sealed class ConfigurationMapperTests
{
    private const string ExistingXml = """
        <?xml version="1.0" encoding="utf-8"?>
        <PluginConfiguration xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
          <TorrentClawBaseUrl>https://torrentclaw.com</TorrentClawBaseUrl>
          <TorrentClawApiKey>tc_test_dummy_key</TorrentClawApiKey>
          <TorrentClawTimeoutSeconds>20</TorrentClawTimeoutSeconds>
          <TorrentClawMaxRetries>1</TorrentClawMaxRetries>
          <QbittorrentBaseUrl>http://127.0.0.1:8080</QbittorrentBaseUrl>
          <QbittorrentUsername>admin</QbittorrentUsername>
          <QbittorrentPassword>qb_test_dummy_password</QbittorrentPassword>
          <QbittorrentTimeoutSeconds>25</QbittorrentTimeoutSeconds>
          <QbittorrentCategory>movies</QbittorrentCategory>
          <MovieSavePath>D:\Media\Movies</MovieSavePath>
          <TvSavePath>D:\Media\TV</TvSavePath>
          <DownloadDirectory>D:\Downloads</DownloadDirectory>
          <PreferredResolution>1080p</PreferredResolution>
          <PreferredCodec>HEVC</PreferredCodec>
          <PreferredHdr>SDR</PreferredHdr>
          <PreferredLanguage>it,en</PreferredLanguage>
          <PreferredSubtitleLanguage>it</PreferredSubtitleLanguage>
          <MaxSizeGb>12.5</MaxSizeGb>
          <MinimumSeeders>3</MinimumSeeders>
          <PreferRemux>true</PreferRemux>
          <DownloadPollSeconds>30</DownloadPollSeconds>
        </PluginConfiguration>
        """;

    [Fact]
    public void ExistingXmlConfigurationStillDeserializesIntoTheSameProperties()
    {
        var configuration = Deserialize(ExistingXml);

        Assert.Equal("tc_test_dummy_key", configuration.TorrentClawApiKey);
        Assert.Equal("admin", configuration.QbittorrentUsername);
        Assert.Equal("qb_test_dummy_password", configuration.QbittorrentPassword);
        Assert.Equal(@"D:\Media\Movies", configuration.MovieSavePath);
        Assert.Equal(@"D:\Media\TV", configuration.TvSavePath);
        Assert.Equal(@"D:\Downloads", configuration.DownloadDirectory);
        Assert.Equal("it,en", configuration.PreferredLanguage);
        Assert.Equal("it", configuration.PreferredSubtitleLanguage);
        Assert.Equal(20, configuration.TorrentClawTimeoutSeconds);
        Assert.Equal(25, configuration.QbittorrentTimeoutSeconds);
        Assert.Equal(30, configuration.DownloadPollSeconds);
    }

    [Fact]
    public void ViewReportsSecretsOnlyAsFlags()
    {
        var view = ConfigurationMapper.ToView(Deserialize(ExistingXml));
        var json = JsonSerializer.Serialize(view);

        Assert.True(view.TorrentClawApiKeyConfigured);
        Assert.True(view.QbittorrentPasswordConfigured);
        Assert.Equal("it,en", view.PreferredAudioLanguage);
        Assert.DoesNotContain("tc_test_dummy_key", json, StringComparison.Ordinal);
        Assert.DoesNotContain("qb_test_dummy_password", json, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void BlankSecretsPreserveTheStoredValues(string? submitted)
    {
        var existing = Deserialize(ExistingXml);

        var updated = ConfigurationMapper.ApplyUpdate(existing, CreateUpdate() with
        {
            TorrentClawApiKey = submitted,
            QbittorrentPassword = submitted
        });

        Assert.Equal("tc_test_dummy_key", updated.TorrentClawApiKey);
        Assert.Equal("qb_test_dummy_password", updated.QbittorrentPassword);
    }

    [Fact]
    public void SubmittedSecretsReplaceTheStoredValues()
    {
        var updated = ConfigurationMapper.ApplyUpdate(Deserialize(ExistingXml), CreateUpdate() with
        {
            TorrentClawApiKey = " tc_new_dummy_key ",
            QbittorrentPassword = "qb_new_dummy_password"
        });

        Assert.Equal("tc_new_dummy_key", updated.TorrentClawApiKey);
        Assert.Equal("qb_new_dummy_password", updated.QbittorrentPassword);
    }

    [Fact]
    public void LegacyPreferredLanguageAliasIsStillAccepted()
    {
        var existing = Deserialize(ExistingXml);

        var fromAlias = ConfigurationMapper.ApplyUpdate(existing, CreateUpdate() with { PreferredLanguage = "fr" });
        var fromNewName = ConfigurationMapper.ApplyUpdate(existing, CreateUpdate() with
        {
            PreferredAudioLanguage = "de",
            PreferredLanguage = "fr"
        });
        var untouched = ConfigurationMapper.ApplyUpdate(existing, CreateUpdate());

        Assert.Equal("fr", fromAlias.PreferredLanguage);
        Assert.Equal("de", fromNewName.PreferredLanguage);
        Assert.Equal("it,en", untouched.PreferredLanguage);
    }

    [Theory]
    [InlineData("http://torrentclaw.com")]
    [InlineData("https://user:pass@torrentclaw.com")]
    [InlineData("torrentclaw.com")]
    [InlineData("")]
    public void TorrentClawUrlMustBeHttpsWithoutCredentials(string url)
    {
        Assert.Throws<ArgumentException>(() =>
            ConfigurationMapper.ApplyUpdate(new PluginConfiguration(), CreateUpdate() with { TorrentClawBaseUrl = url }));
    }

    [Theory]
    [InlineData("http://192.168.1.10:8080", true)]
    [InlineData("https://qbittorrent.example", true)]
    [InlineData("ftp://192.168.1.10", false)]
    [InlineData("http://admin:secret@192.168.1.10:8080", false)]
    public void QbittorrentUrlAcceptsHttpAndHttpsWithoutCredentials(string url, bool valid)
    {
        var update = CreateUpdate() with { QbittorrentBaseUrl = url };

        if (valid)
        {
            Assert.Equal(url, ConfigurationMapper.ApplyUpdate(new PluginConfiguration(), update).QbittorrentBaseUrl);
        }
        else
        {
            Assert.Throws<ArgumentException>(() => ConfigurationMapper.ApplyUpdate(new PluginConfiguration(), update));
        }
    }

    [Fact]
    public void NumericValuesAreClampedToTheSupportedRanges()
    {
        var updated = ConfigurationMapper.ApplyUpdate(new PluginConfiguration(), CreateUpdate() with
        {
            TorrentClawTimeoutSeconds = 0,
            TorrentClawMaxRetries = 9,
            QbittorrentTimeoutSeconds = 500,
            DownloadPollSeconds = 1,
            MaxSizeGb = -3,
            MinimumSeeders = -1
        });

        Assert.Equal(1, updated.TorrentClawTimeoutSeconds);
        Assert.Equal(3, updated.TorrentClawMaxRetries);
        Assert.Equal(120, updated.QbittorrentTimeoutSeconds);
        Assert.Equal(10, updated.DownloadPollSeconds);
        Assert.Equal(0, updated.MaxSizeGb);
        Assert.Equal(0, updated.MinimumSeeders);
    }

    private static ConfigurationUpdate CreateUpdate() => new()
    {
        TorrentClawBaseUrl = "https://torrentclaw.com",
        QbittorrentBaseUrl = "http://127.0.0.1:8080"
    };

    private static PluginConfiguration Deserialize(string xml)
    {
        var serializer = new XmlSerializer(typeof(PluginConfiguration));
        var settings = new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null };
        using var reader = XmlReader.Create(new StringReader(xml.Trim()), settings);
        return (PluginConfiguration)serializer.Deserialize(reader)!;
    }
}
