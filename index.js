"use strict";

const SettingsUI = require("tera-mod-ui").Settings;

const VG_CHEST_WARN = 90;
const VG_CHEST_NOTICE = 97;
const DAILY_CAP = 16;
const PLAYTIME_INTERVAL = 1800000;

module.exports = function AutoGuildquest(mod) {
	let myQuestId = 0,
		cleared = 0,
		entered = false,
		hold = false,
		daily = 0,
		playTimeInterval = null,
		previousPlayTimeCheck = null;

	const msg = m => mod.command.message(m);

	mod.game.initialize("inventory");

	mod.dispatch.addDefinition("S_AVAILABLE_EVENT_MATCHING_LIST", 3, `${__dirname}\\defs\\S_AVAILABLE_EVENT_MATCHING_LIST.3.def`);
	mod.dispatch.addDefinition("C_RECEIVE_PLAYTIME_EVENT_REWARD", 99, `${__dirname}\\defs\\C_RECEIVE_PLAYTIME_EVENT_REWARD.99.def`);

	const delays = mod.settings.delays || {
		vanguard: 1000,
		completeExtra0: 500,
		completeExtra1: 1000,
		guildFinish: 2000,
		guildRestart: 4000
	};

	mod.game.me.on("change_zone", zone => {
		if (mod.settings.battleground.includes(zone)) {
			hold = true;
		} else if (hold && myQuestId !== 0) {
			hold = false;
			completeQuest();
			dailycredit();
		}
	});

	mod.game.on("enter_game", () => {
		daily = 0;
		playTimeConfig();
	});

	mod.hook("S_AVAILABLE_EVENT_MATCHING_LIST", 3, event => {
		daily = event.currDailyBonusCompleted;
	});

	mod.hook("S_LOGIN", "event", () => {
		mod.hookOnce("S_SPAWN_ME", "event", () => {
			mod.setTimeout(dailycredit, 1000 + Math.random() * 250);
		});
	});

	mod.hook("S_FIELD_EVENT_ON_ENTER", "raw", () => {
		entered = true;
	});

	mod.hook("C_RETURN_TO_LOBBY", "raw", () => {
		entered = false;
	});

	mod.hook("S_COMPLETE_EVENT_MATCHING_QUEST", 1, event => {
		daily++;
		if (mod.settings.Vanguard) {
			myQuestId = event.id;
			if (!hold) {
				mod.setTimeout(completeQuest, delays.vanguard + Math.random() * 250);
			}
		}
	});

	mod.hook("S_FIELD_EVENT_PROGRESS_INFO", 1, () => {
		if (mod.settings.Guardian) {
			completeGuardian();
		}
	});

	mod.hook("S_UPDATE_GUILD_QUEST_STATUS", 1, event => {
		if (mod.settings.GQuest && event.targets.length && event.targets[0].completed === event.targets[0].total) {
			mod.setTimeout(() => {
				mod.send("C_REQUEST_FINISH_GUILD_QUEST", 1, { quest: event.quest });
			}, delays.guildFinish + Math.random() * 1000);
			mod.setTimeout(() => {
				mod.send("C_REQUEST_START_GUILD_QUEST", 1, { questId: event.quest });
			}, delays.guildRestart + Math.random() * 1000);
		}
	});

	mod.hook("S_FIELD_POINT_INFO", 2, event => {
		if (entered && event.cleared !== cleared && event.cleared - 1 > event.claimed) {
			mod.send("S_CHAT", mod.majorPatchVersion >= 108 ? 4 : 3, {
				channel: 21,
				gm: true,
				name: "Guardian Mission",
				message: `${event.cleared} / 100`
			});
		}
		cleared = event.cleared;
	});

	function completeQuest() {
		mod.send("C_COMPLETE_DAILY_EVENT", 1, { id: myQuestId });
		mod.setTimeout(() => mod.send("C_COMPLETE_EXTRA_EVENT", 1, { type: 0 }), delays.completeExtra0 + Math.random() * 250);
		mod.setTimeout(() => mod.send("C_COMPLETE_EXTRA_EVENT", 1, { type: 1 }), delays.completeExtra1 + Math.random() * 250);
		myQuestId = 0;
		if (mod.settings.VLog) report();
		if (mod.settings.VGChestEnabled) checkChests();
	}

	function report() {
		msg(daily < DAILY_CAP
			? `Daily Vanguard Requests completed: ${daily}`
			: `You have completed all ${DAILY_CAP} Vanguard Requests today.`);
	}

	function checkChests() {
		const vgChests = mod.game.inventory.getTotalAmountInBagOrPockets(Number(mod.settings.VGChestItem));
		if (vgChests > VG_CHEST_WARN) msg(`You're at ${vgChests} VG chests. Open or bank them soon.`);
		if (vgChests >= VG_CHEST_NOTICE) {
			mod.send("S_CHAT", mod.majorPatchVersion >= 108 ? 4 : 3, {
				channel: 21,
				message: `You're at ${vgChests} VG chests. Open or bank them immediately.`
			});
		}
	}

	function completeGuardian() {
		let attempts = 0;
		const maxPerTrigger = 10;

		const claim = () => {
			if (!mod.settings.Guardian || attempts >= maxPerTrigger) return;
			mod.send("C_REQUEST_FIELD_POINT_REWARD", 1, {});
			attempts++;
			setImmediate(claim);
		};

		claim();
	}

	function dailycredit() {
		if (mod.settings.Daily) {
			const _ = mod.trySend("C_REQUEST_RECV_DAILY_TOKEN", 1, {});
			if (!_) mod.log("Unmapped protocol packet 'C_REQUEST_RECV_DAILY_TOKEN'.");
		}
	}

	function playTimeConfig() {
		if (mod.settings.playTimeEnabled) {
			checkPlayTime();
			playTimeInterval = mod.setInterval(checkPlayTime, PLAYTIME_INTERVAL);
		} else {
			mod.clearInterval(playTimeInterval);
		}
	}

	function checkPlayTime() {
		mod.send("C_REQUEST_PLAYTIME", 1, {});
	}

	mod.hook("S_PLAYTIME_EVENT_REWARD_DATA", 1, e => {
		if (!mod.settings.playTimeEnabled) return;
		if (previousPlayTimeCheck && (Date.now() - previousPlayTimeCheck) < 5000) return;
		previousPlayTimeCheck = Date.now();
		e.items.forEach(item => {
			if (item.timeRequired < 600 && item.redeemable === 1) {
				mod.send("C_RECEIVE_PLAYTIME_EVENT_REWARD", 99, {
					row: item.row,
					column: item.column
				});
			}
		});
	});

	let ui = null;
	if (global.TeraProxy.GUIMode) {
		ui = new SettingsUI(mod, require("./settings_structure"), mod.settings, { alwaysOnTop: true, width: 550, height: 232 });
		ui.on("update", settings => { mod.settings = settings; playTimeConfig(); });
		this.destructor = () => {
			if (ui) {
				ui.close();
				ui = null;
			}
		};
	}

	mod.command.add("auto", {
		"VG": () => {
			mod.settings.Vanguard = !mod.settings.Vanguard;
			msg(`Auto-Vanguardquest: ${mod.settings.Vanguard ? "On" : "Off"}`);
		},
		"GQ": () => {
			mod.settings.GQuest = !mod.settings.GQuest;
			msg(`Auto-Guildquest: ${mod.settings.GQuest ? "On" : "Off"}`);
		},
		"GL": () => {
			mod.settings.Guardian = !mod.settings.Guardian;
			msg(`Auto-Guardian-Legion: ${mod.settings.Guardian ? "On" : "Off"}`);
		},
		"DC": () => {
			mod.settings.Daily = !mod.settings.Daily;
			msg(`Auto-Daily-Credit: ${mod.settings.Daily ? "On" : "Off"}`);
		},
		"VGLog": () => {
			mod.settings.VLog = !mod.settings.VLog;
			msg(`Vanguard-Quest Logger: ${mod.settings.VLog ? "On" : "Off"}`);
		},
		"VGChest": () => {
			mod.settings.VGChestEnabled = !mod.settings.VGChestEnabled;
			msg(`Vanguard-Chest Notifier: ${mod.settings.VGChestEnabled ? "On" : "Off"}`);
		},
		"PT": () => {
			mod.settings.playTimeEnabled = !mod.settings.playTimeEnabled;
			msg(`Auto Claim Daily playTime Rewards: ${mod.settings.playTimeEnabled ? "On" : "Off"}`);
			playTimeConfig();
		},
		"UI": () => {
			ui.show();
		},
		"$default": () => {
			msg("Invalid argument. Usage: 'auto' followed by one of:");
			msg("UI | Show the UI settings");
			msg("VG | Auto-Vanguard");
			msg("GQ | Auto-GuildQuest with relaunch");
			msg("VGLog | Vanguard-Quest-Logger");
			msg("VGChest | Vanguard Chest Notifier");
			msg("PT | Auto-Claim Daily playTime Rewards");
			msg("GL | Auto-claim Guardian Legion box");
			msg("DC | Auto-claim Daily Credit");
		}
	});
};
