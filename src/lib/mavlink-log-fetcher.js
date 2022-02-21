/*
 * Copyright (c) 2020. UAVenture AG. All rights reserved.
 */

"use strict";

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Emitter = require('events').EventEmitter;

var loggingBase = require('../lib/logging-base.js')

const InternalLogFetchState = {
    STANDBY: 0,
    LISTING: 1,
    FETCHING: 2,
    WRITING: 3
}

const LogFetcherState = {
    PAUSED: 0,
    RUNNING: 1,
    ERROR: 2,
    NO_LOGS: 3,
}

let MavlinkLogFetcher = function(mavlib, logPath, reverse=false) {
    let self = this;

    self.logger = new loggingBase.LoggingFactory().getLogger();
    self.logger.setLevel('debug');

    // the timeout after which the log block requested should be retried
    self.requestTimeoutMillis = process.env.LOG_FETCH_REQ_TIMEOUT_MILLIS || 200;

    self.mavlib = mavlib;
    self.logPath = logPath;
    self.reverse = reverse;

    // temporary log list during listing
    self.list = [];
    self.listUpdated = false;
    self.currentListItems = 0;
    self.totalListItems = -1;

    // the amount of data we try to fetch in one go, should be divisible by 90
    self.mainRequestSize = 40950;

    // current log being fetched
    self.currentId = -1;

    // the offset of the current block we're fetching
    self.blockOffset = 0;
    // array of missing chunks for the current block (first element will be the full block)
    self.blockMissingData = [];
    // buffer for the current block
    self.blockBuffer = Buffer.alloc(self.mainRequestSize);

    // the offset of the current request
    self.currentRequestOffset = 0;
    // the current request size
    self.currentRequestSize = 0;
    // the next offset we expect
    self.nextDataOffset = 0;
    // the last offset we received
    self.receivedDataOffset = 0;

    self.dataReceived = 0;
    self.averageRate = 0;
    self.averageRateTime = 0;
    self.prevMessageTime = 0;

    self.lastActionTs = 0;
    self.lastReceivedTs = 0;

    self.state = LogFetcherState.PAUSED;
    self.fetchState = InternalLogFetchState.STANDBY;
    self.fetchStateData = {
        "entries": []
    };

    self.fetchStateFile = path.join(logPath, '.state.json');
    self.writingBlocked = false;

    self.maybeMigrate();

    self.loadState();
}

util.inherits(MavlinkLogFetcher, Emitter);

/**
 * Temporary function to rename the state file. Remove once all system have been updated and this ran.
 */
MavlinkLogFetcher.prototype.maybeMigrate = function() {
    var self = this;

    let oldFile = path.join(self.logPath, 'state.json');

    if (fs.existsSync(oldFile)) {
        fs.rename(oldFile, self.fetchStateFile, function(err) {
                if (err) self.logger.error('ERROR - Cannot rename file. Reason:' + err);

                self.logger.info('Renamed: ' + oldFile + ' to: ' + self.fetchStateFile);
        });
    }
}

MavlinkLogFetcher.prototype.loadState = function()
{
    var self = this;

    try {
        var data = fs.readFileSync(self.fetchStateFile);
        self.fetchStateData = JSON.parse(data);
        self.logger.debug("loaded state");
    } catch (err) {
        self.logger.info('Fetch state file not present or empty. ' + self.fetchStateFile);
        return false;
    }

    return true;
}

MavlinkLogFetcher.prototype.saveState = function()
{
    var self = this;

    var data = JSON.stringify(self.fetchStateData);

    try {
        fs.writeFileSync(self.fetchStateFile, data);
        self.logger.debug("saved state");

    } catch (err) {
        self.logger.error(err);
        return false;
    }

    return true;
}

MavlinkLogFetcher.prototype.onMessage = function(msg)
{
    var self = this;

    if (msg.name === "LOG_ENTRY" && self.fetchState === InternalLogFetchState.LISTING) {
        self.lastReceivedTs = Date.now();

        if (msg.num_logs === 0) {
            // we're not sure if this because there are no logs or because the log handler cannot open the temp file anymore
            self.stop();
            self.state = LogFetcherState.NO_LOGS;
            self.logger.warn("received 0 log count");
        }

        if (self.totalListItems < 0) {
            self.totalListItems = msg.num_logs;
        }

        if (self.list[msg.id] === undefined) {
            self.list[msg.id] = msg;
            self.currentListItems++;

            self.logger.debug('LOG_ENTRY: ' + self.currentListItems);
        }

        if (self.currentListItems === self.totalListItems) {
            self.logger.debug("received all log entries");

            // update old state
            for (var i = 0; i < self.list.length; i++) {
                // identify the log
                var hash = crypto.createHash('sha256');
                hash.update(self.list[i].id.toString())
                hash.update(self.list[i].time_utc.toString())
                hash.update(self.list[i].size.toString())

                entry = {
                    "id": self.list[i].id,
                    "utc": self.list[i].time_utc,
                    "size": self.list[i].size,
                    "fetched": 0,
                    "hash": hash.digest('hex')
                }

                if (i >= self.fetchStateData.entries.length || self.fetchStateData.entries[i].hash !== entry.hash) {
                    if (i < self.fetchStateData.entries.length) {
                        self.logger.debug(util.format("pruning state, keeping first %d entries", i));
                        // we have more entries in our old list which don't match anymore, delete them
                        self.fetchStateData.entries = self.fetchStateData.entries.slice(0, i);
                    }

                    // add new or changed entries to state
                    self.logger.debug(util.format("new log found: %d %d %d %s", entry.id, entry.utc,
                        entry.size, entry.hash));
                    self.fetchStateData.entries[i] = entry;
                }
            }

            // reset state, we will start fetching logs on next timeout
            self.fetchState = InternalLogFetchState.STANDBY;
            self.listUpdated = true;
        }
    }

    if (msg.name === "LOG_DATA" && self.fetchState === InternalLogFetchState.FETCHING) {
        self.lastReceivedTs = Date.now();

        if (self.currentId !== msg.id) {
            // just in case we receive data for the previous log if packets delay
            self.logger.debug(util.format("wrong log id %d", msg.id));
            return;
        }

        if (msg.ofs < self.blockOffset || msg.ofs > self.blockOffset + self.mainRequestSize) {
            // received packet outside current main data space
            // this can happen because there are race conditions between finishing the block and timeouts
            self.logger.debug(util.format("outside space %d %d %d", msg.ofs, self.blockOffset,
                self.blockOffset + self.mainRequestSize));
            return;
        }

        if (msg.ofs > self.nextDataOffset) {
            // looks like we're missing from self.nextDataOffset to msg.ofs
            self.blockMissingData.push([self.nextDataOffset, msg.ofs]);

        } else {
            // remember the last received offset to recover after a timeout
            self.receivedDataOffset = msg.ofs;
        }

        // this is the offset we expect next:
        self.nextDataOffset = msg.ofs + msg.count;

        // store data
        self.blockBuffer.write(msg.data, msg.ofs - self.blockOffset, msg.count, "binary");
        self.dataReceived += msg.count;

        // current request fulfilled
        if (msg.ofs + msg.count >= self.currentRequestOffset + self.currentRequestSize) {
            if (self.currentRequestOffset === self.blockOffset) {
                self.logger.debug(util.format("missing %d chunks from block", self.blockMissingData.length));
            }

            var entry = self.fetchStateData.entries[self.currentId];

            if (self.blockMissingData.length > 0) {
                // still data we need to get from the current block
                self.logger.debug(util.format("chunks %d", self.blockMissingData.length));
                self.fetchData();

            } else if (self.blockOffset + self.mainRequestSize >= entry.size) {
                // we're done with that log file
                self.fetchState = InternalLogFetchState.WRITING;

                self.writingBlocked = !self.file.write(self.blockBuffer.slice(0, entry.size - self.blockOffset),
                    () => {
                        self.file.close();

                        // update state
                        entry.fetched = entry.size;
                        self.saveState();

                        // Downloaded files should start with a '.' so they are hidden and not rsynced yet, so once we are finished
                        // we want to rename it by removing the hidden state.
                        let currentFilename = path.basename(self.file.path);

                        if (currentFilename.startsWith('.')) {
                            let dirname = path.dirname(self.file.path);
                            let newPath = path.join(dirname, currentFilename.substring(1));

                            fs.rename(self.file.path, newPath, function(err) {
                                    if (err) self.logger.error('ERROR - Could not remove the leading dot. Reason:' + err);
                            });
                        }

                        self.fetchState = InternalLogFetchState.STANDBY;
                        self.logger.debug(util.format("downloaded log %d", self.currentId));

                        self.emit('downloaded', self.currentId);
                    });

            } else {
                // fetch next block
                self.fetchState = InternalLogFetchState.WRITING;

                self.logger.debug(util.format("next block %d", self.blockMissingData.length));
                var fetched = self.blockOffset + self.mainRequestSize;

                self.writingBlocked = !self.file.write(self.blockBuffer, () => {
                    // update state
                    entry.fetched = fetched;
                    self.saveState();

                    // set next block offset
                    self.blockOffset += self.mainRequestSize;

                    // add block to data array
                    var reqSize = Math.min(self.mainRequestSize, entry.size - self.blockOffset);
                    self.blockMissingData.push([self.blockOffset, self.blockOffset + reqSize]);

                    self.fetchState = InternalLogFetchState.FETCHING;
                    self.fetchData();
                });
            }
        }
    }
}

MavlinkLogFetcher.prototype.startListing = function()
{
    var self = this;

    // set the action TS before state changes
    self.lastActionTs = Date.now();
    self.fetchState = InternalLogFetchState.LISTING;

    self.listUpdated = false;
    self.totalListItems = -1;
    self.list = [];
    self.currentListItems = 0;

    self.listEntries();
}

MavlinkLogFetcher.prototype.listEntries = function()
{
    var self = this;

    var msg;

    if (self.totalListItems <= 0) {
        // request all entries
        self.logger.debug("request all entries");

        msg = new mavlink.messages.log_request_list(
            0, 0, 0, 0xFFFF);

    } else if (self.totalListItems > 0) {
        // only request missing entries
        for (var i = 0; i < self.totalListItems; i++) {
            if (self.list[i] === undefined) {
                self.logger.debug("request entry %d", i);

                msg = new mavlink.messages.log_request_list(
                    0, 0, i, i);

                break;
            }
        }
    }

    if (msg !== undefined) {
        self.lastActionTs = Date.now();
        self.mavlib.sendMessage(msg);
    }
}

MavlinkLogFetcher.prototype.startFetching = function(logId)
{
    var self = this;

    self.currentId = logId;
    var entry = self.fetchStateData.entries[self.currentId];

    if (entry === undefined) {
        // no entry for that id
        self.logger.error(util.format("log entry %d doesn't exist", self.currentId));
        self.startListing();

        return;
    }

    self.logger.debug(util.format("starting fetch for log %d from %d", entry.id, entry.fetched));

    // set the action TS before state changes
    self.lastActionTs = Date.now();
    self.fetchState = InternalLogFetchState.FETCHING;

    // start from the place we stored
    self.blockOffset = entry.fetched;

    // get the log file if it exists already
    const filename = path.join(self.logPath, util.format(".log_%s.px4log", self.getFormattedEpochSeconds(entry.utc)));

    if (fs.existsSync(filename)) {
        var stats = fs.statSync(filename);
        var fileSizeInBytes = stats["size"];

        /*
         * For some reason the Pi with node 10.10.0 does not start writing at the start position
         * supplied to fs.createWriteStream with a+. To make sure that when the entry state and
         * the file are out of sync we're not adding data to the wrong location we're truncating
         * the file first.
         */
        if (fileSizeInBytes > entry.fetched) {
            self.logger.warn(util.format("file and entry size don't match: file %d, entry %d; truncating file",
                fileSizeInBytes, entry.fetched));

            try {
                var fd = fs.openSync(filename, 'r+');
                fs.ftruncateSync(fd, entry.fetched);
                fs.closeSync(fd);
            } catch (err) {
                self.logger.error(err);
            }

        } else if (fileSizeInBytes < entry.fetched) {
            self.logger.debug(util.format("correcting since file size is smaller than entry size: file %d, entry %d",
                fileSizeInBytes, entry.fetched));

            // correct the offset based on what we have stored in the file.
            entry.fetched = fileSizeInBytes;
            self.blockOffset = fileSizeInBytes;
        }
    }

    var reqSize = Math.min(self.mainRequestSize, entry.size - self.blockOffset);

    // add the whole block as missing
    self.blockMissingData = [];
    self.blockMissingData.push([self.blockOffset, self.blockOffset + reqSize]);

    self.file = fs.createWriteStream(filename, { encoding: 'binary', flags: 'a+', start: entry.fetched });
    self.writingBlocked = false;

    self.file.on('drain', () => {
        self.writingBlocked = false;
        self.logger.debug("writing blocked released");
    })

    self.fetchData();
}

/**
 * Format the epoch to the format: yyyy-dd-mm-hh-mm-ss
 * @param epoch the epoch to be formatted.
 * @returns {string} the formatted date/time string.
 */
MavlinkLogFetcher.prototype.getFormattedEpochSeconds = function(epoch) {
    var date = new Date(Number(epoch) * 1000);

    var formattedStr = date.getFullYear() + '-' +
        String((date.getMonth() + 1)).padStart(2, '0') + '-' +
        String(date.getDate()).padStart(2, '0') + '-' +
        String(date.getHours()).padStart(2, '0') + '-' +
        String(date.getMinutes()).padStart(2, '0') + '-' +
        String(date.getSeconds()).padStart(2, '0');

    return formattedStr;
}

MavlinkLogFetcher.prototype.fetchData = function()
{
    var self = this;

    if (self.writingBlocked) {
        self.logger.debug("writing blocked");
        return;
    }

    // get the next chunk of data we should request
    var last = self.blockMissingData.pop();

    // fill request variables
    self.currentRequestOffset = last[0];
    self.currentRequestSize = last[1] - last[0];
    self.nextDataOffset = self.currentRequestOffset;
    self.receivedDataOffset = self.currentRequestOffset;

    var msg = new mavlink.messages.log_request_data(
        0, 0, self.currentId, self.currentRequestOffset, self.currentRequestSize);

    self.logger.debug(util.format("fetch %d - %d (%d)", self.currentRequestOffset,
        self.currentRequestOffset + self.currentRequestSize, self.currentRequestSize / 90));

    self.lastActionTs = Date.now();
    self.mavlib.sendMessage(msg);
}

MavlinkLogFetcher.prototype.getState = function()
{
    var self = this;

    return self.state;
}

MavlinkLogFetcher.prototype.start = function()
{
    var self = this;

    self.state = LogFetcherState.RUNNING;
    self.startListing();
}

MavlinkLogFetcher.prototype.stop = function()
{
    var self = this;

    self.state = LogFetcherState.PAUSED;
    self.fetchState = InternalLogFetchState.STANDBY;
}

MavlinkLogFetcher.prototype.getTotalPercentage = function()
{
    var self = this;

    var total = 0;
    var fetched = 0;

    for (var i = 0; i < self.fetchStateData.entries.length; i++) {
        var entry = self.fetchStateData.entries[i];
        total += entry.size;
        fetched += entry.fetched;
    }

    if (total > 0) {
        return fetched / total;
    }

    // FIXME: no data = 100% done?
    return 1.0;
}

MavlinkLogFetcher.prototype.checkForTimeout = function()
{
    var self = this;
    var now = Date.now();

    if (self.state !== LogFetcherState.RUNNING) {
        return;
    }

    if (self.fetchState === InternalLogFetchState.STANDBY && self.listUpdated) {
        let idx = -1;
        let inc = 1;

        if (self.reverse) {
            idx = self.fetchStateData.entries.length;
            inc = -1;
        }

        for (var i = 0; i < self.fetchStateData.entries.length; i++) {

            idx += inc;

            var entry = self.fetchStateData.entries[idx];

            if (entry.fetched < entry.size) {
                // fetch data we don't have yet
                self.startFetching(entry.id);
                break;
            }
        }

        return;
    }

    if (now - self.averageRateTime > 200) {
        if (self.dataReceived > 0) {
            self.averageRate = self.averageRate * 0.9 +
                ((self.dataReceived / 1024) / ((now - self.averageRateTime) * 0.001)) * 0.1;
        }

        self.dataReceived = 0;
        self.averageRateTime = now;
    }

    if (now - self.prevMessageTime > 2e3 && self.fetchState === InternalLogFetchState.FETCHING) {
        var entry = self.fetchStateData.entries[self.currentId];

        self.emitStats(entry);

        self.logger.debug(util.format("fetching log %d of %d at %dkB/s. %d%% (%d/%dMB), %d%% of total",
            self.currentId, self.totalListItems, Math.round(self.averageRate),
            Math.round(entry.fetched / entry.size * 100),
            (entry.fetched / 1000000).toFixed(2), (entry.size / 1000000).toFixed(2),
            Math.round(self.getTotalPercentage() * 100)));

        self.prevMessageTime = now;
    }

    // long timeout during fetching, try to get the list again
    if (now - self.lastReceivedTs > 5000 && self.fetchState === InternalLogFetchState.FETCHING) {
        self.logger.error("long timeout, resetting");
        self.startListing();

        return;
    }

    // long timeout during writing
    if (now - self.lastReceivedTs > 5000 && self.fetchState === InternalLogFetchState.WRITING) {
        self.logger.error("write block, resetting");
        self.startListing();

        return;
    }

    // check if we should re-request entries
    if (self.fetchState === InternalLogFetchState.LISTING) {
        if (now - self.lastActionTs > 10000 && now - self.lastReceivedTs > 10000) {
            self.logger.warn("list timeout");
            self.listEntries();
        }
    }

    // check if we should re-request data
    if (self.fetchState === InternalLogFetchState.FETCHING) {
        if (now - self.lastActionTs > self.requestTimeoutMillis && now - self.lastReceivedTs > self.requestTimeoutMillis) {
            // we have to re-add the chunk we were requesting before
            // but only from self.receivedDataOffset because that's what we already got
            self.logger.debug("fetch timeout");
            self.blockMissingData.push([self.receivedDataOffset, self.currentRequestOffset + self.currentRequestSize]);
            self.fetchData();
        }
    }
}

MavlinkLogFetcher.prototype.emitStats = function(entry)
{
    let stats = {
        logId: this.currentId,
        logTotal: this.totalListItems,
        downloadRate: this.averageRate,
        logFetchedBytes: entry.fetched,
        logTotalBytes: entry.size,
        totalProgressPercent: this.getTotalPercentage()
    };

    this.emit('progress', stats);
}

MavlinkLogFetcher.prototype.isTransferringLogs = function() {
    return this.state === LogFetcherState.RUNNING;
}

MavlinkLogFetcher.prototype.isTimedOut = function() {
    return false;
}

/**
 * A system time update just occurred so we need to reset any critical timers.
 * @param {boolean} true if the system time change is currently underway.
 */
MavlinkLogFetcher.prototype.setTimeChangingFlag = function(inProgress) {
    // If the time update just finished we need to reset timers that are sensitive just after startup.
    if (this.timeChangeUnderway && !inProgress) {
        this.lastDownloadReportMillis = Date.now();
        this.lastLogEventReceiptMillis = Date.now();
    }

    this.timeChangeUnderway = inProgress;
}

MavlinkLogFetcher.InternalLogFetchState = InternalLogFetchState;
MavlinkLogFetcher.LogFetcherState = LogFetcherState;

module.exports.MavlinkLogFetcher = MavlinkLogFetcher;
