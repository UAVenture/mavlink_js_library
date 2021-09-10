'use strict';

const LEVELS = {
    "error": 0,
    "warn": 1,
    "info": 2,
    "http": 3,
    "verbose": 4,
    "debug": 5,
    "silly": 6
};

const LEVELS_PRINT = [
    "ERROR", "WARN", "INFO", "HTTP", "VERBOSE", "DEBUG", "SILLY"
];

/*
 * Default console logger.
 */
var InternalLogger = function() {
    this.level = LEVELS['info'];
};

InternalLogger.prototype.setLevel = function(level) {
    if (level in LEVELS) {
        this.level = LEVELS[level];
    }
};

InternalLogger.prototype.error = function(message, data) {
    if (this.level >= 0) {
        console.log(`${LEVELS_PRINT[this.level]}: ${message}`);
    }
};

InternalLogger.prototype.warn = function(message, data) {
    if (this.level >= 1) {
        console.log(`${LEVELS_PRINT[this.level]}: ${message}`);
    }
};

InternalLogger.prototype.info = function(message, data) {
    if (this.level >= 2) {
        console.log(`${LEVELS_PRINT[this.level]}: ${message}`);
    }
};

InternalLogger.prototype.http = function(message, data) {
    if (this.level >= 3) {
        console.log(`${LEVELS_PRINT[this.level]}: ${message}`);
    }
};

InternalLogger.prototype.verbose = function(message, data) {
    if (this.level >= 4) {
        console.log(`${LEVELS_PRINT[this.level]}: ${message}`);
    }
};

InternalLogger.prototype.debug = function(message, data) {
    if (this.level >= 5) {
        console.log(`${LEVELS_PRINT[this.level]}: ${message}`);
    }
};

InternalLogger.prototype.silly = function(message, data) {
    if (this.level >= 5) {
        console.log(`${LEVELS_PRINT[this.level]}: ${message}`);
    }
};

var LoggingFactory = function() {};

/*
 * Override prototype "getLogger" with function to return logger of choice.
 */
LoggingFactory.prototype.getLogger = function() {
    return new InternalLogger();
}

module.exports.LoggingFactory = LoggingFactory;
module.exports.InternalLogger = InternalLogger;
