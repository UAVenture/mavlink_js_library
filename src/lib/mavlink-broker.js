'use strict';
var events = require("events");
var util = require("util");
var Long = require("long");

var mavjs = require('./mavlink-lib.js');
var mavsys = require('./mavlink-system.js');
var loggingBase = require('../lib/logging-base.js')

var MavlinkSystemBroker = function(connection, srcId = 255, srcComp = 0, mavlinkVersion = 0) {
	let self = this;

    self.logger = new loggingBase.LoggingFactory().getLogger();

    self.connection = connection;

    self.systems = [];

    self.keepAliveInterval = undefined;

    self.mavlib = new mavjs.MavlinkLib(srcId, srcComp, (data) => {
        self.connection.send(data);
    }, mavlinkVersion);

    // Forward data for parsing when it comes in:
    self.connection.on('data', (data) => {
        self.mavlib.parseData(data);
    });

    // Receive successfully parsed messages:
    self.mavlib.on('message', (msg) => {
        self.handleMessage(msg);
    });

    // Allow to register to events emitted by the mavlink processor
    self.on('newListener', function (event, listener) {
        self.mavlib.on(event, listener);
    });
}

util.inherits(MavlinkSystemBroker, events.EventEmitter);

/*
 * Creates and returns the universal system. This system will receive all data
 * from the broker link, no matter the source system ID.
 */
MavlinkSystemBroker.prototype.getUniversalSystem = function() {
    let self = this;

    // The universal system is assigned as system 0
    if (self.systems[0] === undefined) {
        self.systems[0] = new mavsys.MavlinkSystem(0, self.mavlib);
    }

    return self.systems[0];
}

MavlinkSystemBroker.prototype.getSystem = function(sysid) {
    let self = this;

    if (self.systems[sysid] == undefined) {
        // create new system
        self.logger.info(`System created manually ${sysid}`);

        // TODO: Create new mavlib per system so each system can receive data in a separate MAVLink version
        self.systems[sysid] = new mavsys.MavlinkSystem(sysid, self.mavlib);
    }

    return self.systems[sysid];
}

MavlinkSystemBroker.prototype.getSystems = function() {
    let self = this;

    return self.systems;
}

MavlinkSystemBroker.prototype.sendMessage = function(msg) {
    let self = this;

    self.mavlib.sendMessage(msg);
}

MavlinkSystemBroker.prototype.sendRawData = function(msg) {
    let self = this;

    self.mavlib.sendRawData(msg);
}

MavlinkSystemBroker.prototype.handleMessage = function(msg) {
    let self = this;

    if (msg.header === undefined) {
        return;
    }

    let sysid = msg.header.srcSystem;

    // Create new systems on heartbeat messages
    if (msg.header.msgId == mavjs.mavlink.MAVLINK_MSG_ID_HEARTBEAT) {
        // Only add autopilot systems
        let acceptSystem = msg.autopilot != mavlink.MAV_AUTOPILOT_INVALID &&
                           msg.header.srcComponent == mavlink.MAV_COMP_ID_AUTOPILOT1;

        if (self.systems[sysid] === undefined && acceptSystem) {
            // create new system
            self.logger.info(`New system ${sysid}`);

            // TODO: Create new mavlib per system so each system can receive data in a separate MAVLink version
            self.systems[sysid] = new mavsys.MavlinkSystem(sysid, self.mavlib);

            self.emit('newSystem', self.systems[sysid]);
        }
    }

    // Update system specific data
    if (self.systems[sysid] !== undefined) {
        self.systems[sysid].updateData(msg);
    }

    // Update the universal system if created
    if (self.systems[0] !== undefined) {
        self.systems[0].updateData(msg);
    }

}

MavlinkSystemBroker.prototype.sendPing = function() {
    const self = this;

    let timeUsecLong = Long.fromNumber(Date.now(), true);

    self.sendMessage(new mavjs.messages.ping(
        [timeUsecLong.getLowBits(), timeUsecLong.getHighBits()],
        0, 0, 0));
}

MavlinkSystemBroker.prototype.enableKeepAlive = function() {
    const self = this;

    if (self.keepAliveInterval) {
        return;
    }

    self.keepAliveInterval = setInterval(() => {
        self.sendPing();
    }, 5000);

    // send one out right away
    self.sendPing();
}

module.exports.MavlinkSystemBroker = MavlinkSystemBroker;
