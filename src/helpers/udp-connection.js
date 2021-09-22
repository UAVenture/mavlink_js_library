'use strict';
var events = require("events");
var util = require("util");
var dgram = require('dgram');
var loggingBase = require('../lib/logging-base.js')

var UdpConnection = function(localAddr, localPort = 14570, remoteHost, remotePort = 14555) {
    var self = this;

    self.logger = new loggingBase.LoggingFactory().getLogger();

    self.config = {
        localPort: localPort,
        localAddr: localAddr,
        remotePort: remotePort,
        remoteAddr: remoteHost
    };

    self.socket = dgram.createSocket('udp4');

    if (self.config.localAddr !== undefined && self.config.localPort !== undefined) {
        self.socket.bind(self.config.localPort, self.config.localAddr, function(){
            self.logger.info(util.format("Bound local interface %s:%s", self.config.localAddr, self.config.localPort));
        });
    }

    self.socket.on("message", function(data, remote){
        self.emit("data", data);

        if (self.config.remoteAddr === undefined) {
            self.logger.info(util.format("New remote %s:%d", remote.address, remote.port));

            self.config.remotePort = remote.port;
            self.config.remoteAddr = remote.address;
        }
    });
}

UdpConnection.prototype.send = function(buffer){
    var self = this;

    if (self.socket && self.config.remoteAddr && self.config.remotePort) {
        self.socket.send(buffer, 0, buffer.length
            , self.config.remotePort, self.config.remoteAddr);
    }
};

util.inherits(UdpConnection, events.EventEmitter);

module.exports.UdpConnection = UdpConnection;
