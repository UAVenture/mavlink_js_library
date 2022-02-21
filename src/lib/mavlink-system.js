'use strict';
var events = require("events");
var util = require("util");

var loggingBase = require('../lib/logging-base.js')
var lib = require('./mavlink-lib.js');

const SUB_MODES = [
    "none",
    "Ready",
    "Takeoff",
    "Loiter",
    "Mission",
    "RTL",
    "Land",
    "RTGS",
    "Follow"
]

const BASE_MODES = [
    "none",
    "Manual",
    "Altitude",
    "Position",
    "Auto",
    "Acro",
    "Offboard",
    "Stabilised"
]

var MavlinkSystem = function(sysId, mavlib) {
	let self = this;

    self.logger = new loggingBase.LoggingFactory().getLogger();

    self.mavlib = mavlib;
    self.sysId = sysId;

    self.data = [];
    self.lastUpdate = 0;
    self.lastCustomMode = 0;
    self.lastLandedState = 0;
    self.lastSystemStatus = 0;
    self.lastSafetyState = 0;

    self.info = {
        position: {
            valid: false,
            lat: undefined,
            lon: undefined,
            alt: undefined
        },
        hud: {
            hdg: undefined,
            airspeed: 0.0,
            groundspeed: 0.0,
            roll: 0.0,
            pitch: 0.0,
            landedState: "unknown",
            flightMode: "unknown",
            armedState: "unknown",
            safetyState: "unknown"
        },
        comms: {
            connected: false,
            lastHeartbeat: 0
        }
    };

    self.logFetcher = undefined;

    setInterval(() => {
        self.connectionCheck();
    }, 333);
}

util.inherits(MavlinkSystem, events.EventEmitter);

MavlinkSystem.prototype.sendMessage = function(msg) {
    let self = this;

    self.mavlib.sendMessage(msg);
}

MavlinkSystem.prototype.sendRawData = function(msg) {
    let self = this;

    self.mavlib.sendRawData(msg);
}

MavlinkSystem.prototype.connectionCheck = function(msg) {
    let self = this;
    let now = Date.now();

    if (now > self.info.comms.lastHeartbeat + 10e3 && self.info.comms.connected) {
        self.info.comms.connected = false;
        self.logger.warn(`System ${self.sysId} lost connection`);

        self.emit('statusUpdate');
    }
}

MavlinkSystem.prototype.updateData = function(msg) {
    let self = this;
    let now = Date.now();
    let statusChanged = false;

    self.lastUpdate = now;

    self.data[msg.header.msgId] = msg;

    if (msg.header.msgId === lib.mavlink.MAVLINK_MSG_ID_STATUSTEXT) {
        self.logger.info(`Sys ${self.sysId}; ${msg.severity}: ${msg.text}`);
    }

    if (msg.header.msgId === lib.mavlink.MAVLINK_MSG_ID_EXTENDED_SYS_STATE) {
        if (msg.landed_state == lib.mavlink.MAV_LANDED_STATE_IN_AIR) {
            self.info.hud.landedState = "On route";

        } else if (msg.landed_state == lib.mavlink.MAV_LANDED_STATE_TAKEOFF) {
            self.info.hud.landedState = "Takeoff";

        } else if (msg.landed_state == lib.mavlink.MAV_LANDED_STATE_LANDING) {
            self.info.hud.landedState = "Landing";

        } else {
            self.info.hud.landedState = "On ground";
        }

        if (self.lastLandedState != msg.landed_state) {
            statusChanged = true;
            self.lastLandedState = msg.landed_state;
        }
    }

    if (msg.header.msgId === lib.mavlink.MAVLINK_MSG_ID_HEARTBEAT) {
        var base = (msg.custom_mode & 0xFF0000) >> 16;
        var sub = (msg.custom_mode & 0xFF000000) >> 24;

        if (self.lastCustomMode != msg.custom_mode) {
            var prev = self.info.hud.flightMode;

            if (base < SUB_MODES.length && sub < BASE_MODES.length) {
                if (base == 4) {
                    self.info.hud.flightMode = SUB_MODES[sub];

                } else {
                    self.info.hud.flightMode = BASE_MODES[base];
                }

            } else {
                self.info.hud.flightMode = 'invalid';
            }

            self.logger.info(util.format("Flight mode changed from %s to %s",
                                         prev, self.info.hud.flightMode));

            self.lastCustomMode = msg.custom_mode;

            statusChanged = true;
        }

        if (self.lastSystemStatus != msg.system_status) {
            if (msg.system_status == lib.mavlink.MAV_STATE_ACTIVE) {
                self.info.hud.armedState = "Armed";

            } else {
                self.info.hud.armedState = "Disarmed";
            }

            self.logger.info(util.format("System status changed to %d",
                                         msg.system_status));

            self.lastSystemStatus = msg.system_status;

            statusChanged = true;
        }

        if (!self.info.comms.connected) {
            self.logger.warn(`System ${self.sysId} connected`);
        }

        self.info.comms.lastHeartbeat = now;
        self.info.comms.connected = true;
    }

    if (msg.header.msgId === lib.mavlink.MAVLINK_MSG_ID_EXTENDED_HUD) {
        if ((msg.safety_state & 0x02) != 0) {
            self.info.hud.safetyState = "Enabled"

        } else {
            self.info.hud.safetyState = "Disabled"
        }

        if (self.lastSafetyState !== msg.safety_state) {
            statusChanged = true;
            self.lastSafetyState = msg.safety_state;
        }
    }

    if (msg.header.msgId === lib.mavlink.MAVLINK_MSG_ID_GLOBAL_POSITION_INT) {
        self.info.position.lat = msg.lat / 1e7;
        self.info.position.lon = msg.lon / 1e7;
        self.info.position.alt = msg.alt / 1e3;
        self.info.hud.hdg = msg.hdg / 1e2;
        self.info.position.valid = true;
    }

    if (msg.header.msgId === lib.mavlink.MAVLINK_MSG_ID_VFR_HUD) {
        self.info.hud.groundspeed = msg.groundspeed * 3.6;
        self.info.hud.airspeed = msg.airspeed * 3.6;
    }

    if (msg.header.msgId === lib.mavlink.MAVLINK_MSG_ID_ATTITUDE) {
        self.info.hud.roll = msg.roll * (180.0 / Math.PI);
        self.info.hud.pitch = msg.pitch * (180.0 / Math.PI);
        self.info.hud.hdg = msg.yaw * (180.0 / Math.PI);
    }

    if (statusChanged) {
        self.emit('statusUpdate');
    }

    if (self.logFetcher) {
        self.logFetcher.onMessage(msg);
    }

    // Provide the same message events as mavlink and MavlinkLib
    self.emit('message', msg);
    self.emit(msg.name, msg);
}

MavlinkSystem.prototype.getLogFetcher = function(logPath) {
    let self = this;

    self.logFetcher = new lib.MavlinkLogFetcher(self.mavlib, logPath);

    return self.logFetcher;
}

module.exports.MavlinkSystem = MavlinkSystem;
