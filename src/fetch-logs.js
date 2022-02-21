'use strict';
var program = require("commander");

const mavjs = require('../src/lib/mavlink-lib.js');

var util = require("util");

const init = async (options, args) => {

    const tcpConn = new mavjs.TcpConnection(args[0], args[1]);

    const broker = new mavjs.MavlinkSystemBroker(tcpConn, 255, 0, 2);

    const fetcher = broker.getUniversalSystem().getLogFetcher(args[2]);
    fetcher.start();

    setInterval(function () {
        fetcher.checkForTimeout();
    }, 100);
};

process.on('unhandledRejection', (err) => {
    console.log(err);
    process.exit(1);
});

program
    .version('1.0.0-alpha-1')
    .usage('[options]')
    .argument('<host>', '')
    .argument('<port>', '')
    .argument('<logPath>', '')
    .parse(process.argv);

init(program.opts(), program.args);
