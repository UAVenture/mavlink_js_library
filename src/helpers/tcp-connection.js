'use strict';
var events = require("events");
var util = require("util");
var net = require('net');
var loggingBase = require('../lib/logging-base.js')

var TcpConnection = function(remoteHost, remotePort = 1515) {
    var self = this;

    self.logger = new loggingBase.LoggingFactory().getLogger();

    self.config = {
        remotePort: remotePort,
        remoteAddr: remoteHost
    };

    self.client = new net.Socket();

    self.client.connect(self.config.remotePort, self.config.remoteAddr, function() {
        self.logger.info(util.format("Connected %s:%d", self.config.remoteAddr, self.config.remotePort));
    });

    self.client.on("data", function(data){
        self.emit("data", data);
    });
}

TcpConnection.prototype.send = function(buffer){
    var self = this;

    if (self.client) {
        self.client.write(buffer, 0, buffer.length);
    }
};

util.inherits(TcpConnection, events.EventEmitter);

module.exports.TcpConnection = TcpConnection;
