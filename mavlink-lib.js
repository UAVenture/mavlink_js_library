'use strict';
require('./mavlink.patched.js');
var events = require("events");
var util = require("util");
var Long = require('long');

var MavlinkLib = function(srcSystem, srcComponent, sendDataCallback, protocolVersion = 0) {
	var self = this;

    if (protocolVersion == 2) {
        mavlink.WIRE_PROTOCOL_VERSION = "2.0";

    } else if (protocolVersion == 1) {
        mavlink.WIRE_PROTOCOL_VERSION = "1.0";

    } else {
        mavlink.WIRE_PROTOCOL_VERSION = "0.0";
    }

    self.mavlinkProcessor = new MAVLinkProcessor(null, srcSystem, srcComponent);

    // set "file" for mavlink to write to
    self.mavlinkProcessor.file = {
        write: function(buf){ // passes an array
            var buffer = new Buffer(buf);

            if (sendDataCallback) {
            	sendDataCallback(buffer);
        	}
        }
    };

    // Allow to register to events emitted by the mavlink processor
    self.on('newListener', function (event, listener) {
    	self.mavlinkProcessor.on(event, listener);
    });
}

util.inherits(MavlinkLib, events.EventEmitter);

MavlinkLib.prototype.parseData = function(buffer){
    var self = this;

    return self.mavlinkProcessor.parseBuffer(buffer);
};

MavlinkLib.prototype.sendMessage = function(msg){
	var self = this;

    self.mavlinkProcessor.send(msg);
};

MavlinkLib.prototype.createFloatParamValue = function(value) {
    var buf = Buffer.alloc(4);

    // write already in LE because we keep the byte order by passing an array
    buf.writeFloatLE(value);

    return [buf[0], buf[1], buf[2], buf[3]];
};

MavlinkLib.prototype.createIntParamValue = function(value) {
    // convert float to long
    var num = Long.fromNumber(value);

    // get the byte representation
    var buf = Buffer.from(num.toBytesBE());

    // only use the 4 low end bytes
    var sub = buf.subarray(4, 8);

    // swap them to LE because we keep the byte order by passing an array
    return [sub[3], sub[2], sub[1], sub[0]];
};

MavlinkLib.prototype.createParamSetMessage = function(name, value, isFloat) {
	var self = this;

    var paramType = 0;
    var paramValue = 0;

    if (isFloat) {
        paramType = mavlink.MAV_PARAM_TYPE_REAL32;

        paramValue = self.createFloatParamValue(value);

    } else {
        paramType = mavlink.MAV_PARAM_TYPE_INT32;

        paramValue = self.createIntParamValue(value);
    }

    var msg = new mavlink.messages.param_set(
        1, 0, name, paramValue, paramType
    );

    return msg;
};

MavlinkLib.prototype.readParamValue = function(msg) {
	var value = undefined;

    if (msg.param_type == mavlink.MAV_PARAM_TYPE_INT32) {
        // get the 4 bytes and swapp them from LE to BE
        var swapped = [msg.param_value[3], msg.param_value[2], msg.param_value[1], msg.param_value[0]];

        // get the number and shift it to the 4 low end bytes (by just using the high end part)
        value = Long.fromBytes(swapped).high;

    } else {
        var buf = Buffer.from(msg.param_value);

        // read in LE because mavlink uses that for packing
        value = buf.readFloatLE();
    }

    return value;
}

module.exports.messages = mavlink.messages;
module.exports.MavlinkLib = MavlinkLib;
module.exports.mavlink = mavlink;
