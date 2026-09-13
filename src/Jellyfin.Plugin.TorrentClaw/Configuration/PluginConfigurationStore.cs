namespace Jellyfin.Plugin.TorrentClaw.Configuration;

/// <summary>Reads and persists the Jellyfin plugin XML configuration.</summary>
public interface IPluginConfigurationStore
{
    PluginConfiguration Load();

    void Save(PluginConfiguration configuration);
}

public sealed class PluginConfigurationStore : IPluginConfigurationStore
{
    public PluginConfiguration Load() => Plugin.Instance?.Configuration ?? new PluginConfiguration();

    public void Save(PluginConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        var plugin = Plugin.Instance ?? throw new InvalidOperationException("Plugin is not initialized.");
        plugin.UpdateConfiguration(configuration);
    }
}
