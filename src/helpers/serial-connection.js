'use strict';
var events = require("events");
var util = require("util");
var SerialPort = require('serialport');
var loggingBase = require('../lib/logging-base.js')

var SerialConnection = function(serialPort, baudrate) {
    var self = this;

    self.portOpen = false;

    self.logger = new loggingBase.LoggingFactory().getLogger();

    self.serial = new SerialPort(serialPort, {
        baudRate: baudrate
    });

    self.serial.on("open", function () {
        self.logger.info(util.format('Serial port open %s at %d', serialPort, baudrate));
        self.portOpen = true;
    });

    self.serial.on("data", function(data){
        self.emit("data", data);
    });

    self.serial.on('error', function(err) {
        self.server.log("error", err.message);
    });
};

util.inherits(SerialConnection, events.EventEmitter);

SerialConnection.prototype.send = function(buffer){
    var self = this;

    if (self.serial && self.portOpen) {
        self.serial.write(buffer);
    }
};

module.exports.SerialConnection = SerialConnection;
