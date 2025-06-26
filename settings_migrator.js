const DefaultSettings = {
	"Vanguard": true,
	"VLog": false,
	"VGChestEnabled": true,
	"VGChestItem": 156426,
	"GQuest": true,
	"Guardian": true,
	"Daily": true,
	"battleground": [
		102, 103, 110, 111, 112, 116, 117, 118, 119
	],
	"playTimeEnabled": true,
	"delays": {
		"vanguard": 1000,
		"completeExtra0": 500,
		"completeExtra1": 1000,
		"guildFinish": 2000,
		"guildRestart": 4000
	}
};

module.exports = function MigrateSettings(from_ver, to_ver, settings) {
	if (from_ver === undefined) {
		return { ...DefaultSettings, ...settings };
	} else if (from_ver === null) {
		return DefaultSettings;
	} else {
		if (from_ver + 1 < to_ver) {
			settings = MigrateSettings(from_ver, from_ver + 1, settings);
			return MigrateSettings(from_ver + 1, to_ver, settings);
		}
		switch (to_ver) {
			case 2:
				settings.VGChestEnabled = true;
				settings.VGChestItem = 156426;
				break;
			case 3:
				settings.playTimeEnabled = true;
				break;
			case 4:
				settings.delays = DefaultSettings.delays;
				break;
			default:
				const oldsettings = settings;
				settings = Object.assign({}, DefaultSettings);
				for (const option in oldsettings) {
					if (settings.hasOwnProperty(option)) {
						settings[option] = oldsettings[option];
					}
				}
				break;
		}
		return settings;
	}
};
