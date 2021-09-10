var should = require('should');
var sinon = require('sinon');
require('should-sinon');

var lib = require('../src/lib/mavlink-lib.js');

describe('Test module exports:', function () {

  it('access mavlink enums', function () {
    lib.mavlink.MAV_CMD_NAV_WAYPOINT.should.eql(16);
  });

  it('access MavlinkLib', function () {
    var a = new lib.MavlinkLib(255, 0);
    should.exist(a);
  });

});

describe('Test message handling:', function () {

  // TODO:
  // test send and check sequence number, sys and comp ID
  // test array
  // test message with "payload" field
  // test message with "id" field

  it('create message with enum values', function () {
    var msg = new lib.messages.heartbeat(
        lib.mavlink.MAV_TYPE_GCS, // type
        lib.mavlink.MAV_AUTOPILOT_INVALID, // autopilot
        0, // base mode
        0, // custom mode
        lib.mavlink.MAV_STATE_ACTIVE, // system status
        lib.mavlink.WIRE_PROTOCOL_VERSION
    );

    msg.name.should.eql("HEARTBEAT");
  });

  it('create v2 message', function () {
    var callback = sinon.spy();
    var a = new lib.MavlinkLib(255, 0, callback, 2);

    //                                 airspeed, groundspeed, heading, throttle, alt, climb
    var msg = new lib.messages.vfr_hud(24.321456, 27.12354, 45, 68, 465.12354, 1.231248);
    a.sendMessage(msg);

    callback.should.be.calledOnce();

    var hex = Buffer.from(callback.getCall(0).args[0], 'binary').toString('hex');
    hex.should.eql("fd13000000ff004a00005892c24103fdd841d08fe84389999d3f2d0044aef5");
  });

  it('parse v2 message', function () {
    var callback = sinon.spy();
    var a = new lib.MavlinkLib(255, 0, callback, 2);

    var msg = a.parseData(Buffer.from("fd13000000ff004a00005892c24103fdd841d08fe84389999d3f2d0044aef5", 'hex'));

    msg.length.should.be.eql(1);
    msg[0].name.should.be.eql("VFR_HUD");
    msg[0].airspeed.should.be.eql(24.321456909179688);
    msg[0].groundspeed.should.be.eql(27.1235408782959);
    msg[0].heading.should.be.eql(45);
    msg[0].throttle.should.be.eql(68);
    msg[0].alt.should.be.eql(465.12353515625);
    msg[0].climb.should.be.eql(1.2312480211257935);
  });

  it('parse bad data', function () {
    var callback = sinon.spy();
    var a = new lib.MavlinkLib(255, 0, callback, 2);

    var msg = a.parseData(Buffer.from("fd13000000ff004a00005892c24103fdd841d08fe84389999d3f2d0044aef5", 'hex'));
    console.log(msg);

    // incomplete
    var msg = a.parseData(Buffer.from("fd130000005892c24103fdd841d08fe84389999d3f2d004472e8", 'hex'));
    console.log(msg);

    // valid but unknown
    var msg = a.parseData(Buffer.from("fd13000000ff00d204005892c24103fdd841d08fe84389999d3f2d00444a22", 'hex'));
    console.log(msg);

    // valid but unknown
    var msg = a.parseData(Buffer.from("fd13000000ff00d204005892c24103fdd841d08fe84389999d3f2d00444a22", 'hex'));
    console.log(msg);

    // valid but unknown
    var msg = a.parseData(Buffer.from("fd13000000ff004a00005892c24103fdd841d08fe84389999d3f2d0044aef5", 'hex'));
    console.log(msg);
  });
});

describe('Test version handling:', function () {

  it('parse mavlink v1 message (auto sense)', function () {
    var callback = sinon.spy();

    var a = new lib.MavlinkLib(255, 0, callback, 0);
    var msg = a.parseData(Buffer.from("fe0900ff000000000000010cc004016885", 'hex'));
    msg.length.should.be.eql(1);
    msg[0].name.should.be.eql("HEARTBEAT");
    lib.mavlink.WIRE_PROTOCOL_VERSION.should.be.eql("0.0");

    // check sending is still v1
    var msg = new lib.messages.heartbeat(0, 0, 0, 0, 0, 0);
    a.sendMessage(msg);
    callback.should.be.calledOnce();
    callback.getCall(0).args[0][0].should.be.eql(254);
  });

  it('parse mavlink v2 message (auto sense)', function () {
    var callback = sinon.spy();

    var a = new lib.MavlinkLib(255, 0, callback, 0);
    var msg = a.parseData(Buffer.from("fd09000000ff0000000000000000010cc00402454f", 'hex'));
    msg.length.should.be.eql(1);
    msg[0].name.should.be.eql("HEARTBEAT");
    lib.mavlink.WIRE_PROTOCOL_VERSION.should.be.eql("2.0");

    // check sending is now v2
    var msg = new lib.messages.heartbeat(0, 0, 0, 0, 0, 0);
    a.sendMessage(msg);
    callback.should.be.calledOnce();

    // verify full message after auto switch to v2
    callback.getCall(0).args[0].should.be.eql(Buffer.from('fd01000000ff00000000008e39', 'hex'));

    // can still read v1
    var msg = a.parseData(Buffer.from("fe0900ff000000000000010cc004016885", 'hex'));
    msg.length.should.be.eql(1);
    msg[0].name.should.be.eql("HEARTBEAT");
    lib.mavlink.WIRE_PROTOCOL_VERSION.should.be.eql("2.0");
  });

  it('parse mavlink v1 message (v2 can read v1)', function () {
    var callback = sinon.spy();

    var a = new lib.MavlinkLib(255, 0, callback, 2);
    var msg = a.parseData(Buffer.from("fe0900ff000000000000010cc004016885", 'hex'));
    msg.length.should.be.eql(1);
    msg[0].name.should.be.eql("HEARTBEAT");
    lib.mavlink.WIRE_PROTOCOL_VERSION.should.be.eql("2.0");

    // check sending is v2
    var msg = new lib.messages.heartbeat(0, 0, 0, 0, 0, 0);
    a.sendMessage(msg);
    callback.should.be.calledOnce();
    callback.getCall(0).args[0][0].should.be.eql(253);
  });

  it('parse mavlink v2 message (v1 can read v2)', function () {
    var callback = sinon.spy();

    var a = new lib.MavlinkLib(255, 0, callback, 1);
    var msg = a.parseData(Buffer.from("fd09000000ff0000000000000000010cc00402454f", 'hex'));
    msg.length.should.be.eql(1);
    msg[0].name.should.be.eql("HEARTBEAT");
    lib.mavlink.WIRE_PROTOCOL_VERSION.should.be.eql("1.0");

    // check sending is still v1
    var msg = new lib.messages.heartbeat(0, 0, 0, 0, 0, 0);
    a.sendMessage(msg);
    callback.should.be.calledOnce();
    callback.getCall(0).args[0][0].should.be.eql(254);
  });

  it('send v2 message with zeros', function () {
    var callback = sinon.spy();

    var a = new lib.MavlinkLib(255, 0, callback, 2);

    var msg = new lib.messages.heartbeat(0, 0, 0, 0, 0, 0);
    a.sendMessage(msg);
    callback.should.be.calledOnce();
    callback.getCall(0).args[0].should.be.eql(Buffer.from('fd01000000ff00000000008e39', 'hex'));
  });

  it('send v2 message full content', function () {
    var callback = sinon.spy();

    var a = new lib.MavlinkLib(255, 0, callback, 2);

    var msg = new lib.messages.heartbeat(1, 2, 3, 4, 5, 6);
    a.sendMessage(msg);
    callback.should.be.calledOnce();
    callback.getCall(0).args[0].should.be.eql(Buffer.from('fd09000000ff00000000040000000102030506c9bd', 'hex'));
  });

  it('send v1 message with zeros', function () {
    var callback = sinon.spy();

    var a = new lib.MavlinkLib(255, 0, callback, 1);

    var msg = new lib.messages.heartbeat(0, 0, 0, 0, 0, 0);
    a.sendMessage(msg);
    callback.should.be.calledOnce();
    callback.getCall(0).args[0].should.be.eql(Buffer.from('fe0900ff000000000000000000000013b7', 'hex'));
  });

  it('send v1 message full content', function () {
    var callback = sinon.spy();

    var a = new lib.MavlinkLib(255, 0, callback, 1);

    var msg = new lib.messages.heartbeat(1, 2, 3, 4, 5, 6);
    a.sendMessage(msg);
    callback.should.be.calledOnce();
    callback.getCall(0).args[0].should.be.eql(Buffer.from('fe0900ff00000400000001020305068c5d', 'hex'));
  });

});

describe('Test param functions:', function () {

  it('create positive float', function () {
    var a = new lib.MavlinkLib(255, 0);
    var f = a.createFloatParamValue(123.456789);
    f.should.be.eql([224, 233, 246, 66]);
  });

  it('create negative float', function () {
    var a = new lib.MavlinkLib(255, 0);
    var f = a.createFloatParamValue(-987.654321);
    f.should.be.eql([224, 233, 118, 196]);
  });

  it('create positive int', function () {
    var a = new lib.MavlinkLib(255, 0);
    var f = a.createIntParamValue(123);
    f.should.be.eql([123, 0, 0, 0]);
  });

  it('create negative int', function () {
    var a = new lib.MavlinkLib(255, 0);
    var f = a.createIntParamValue(-987);
    f.should.be.eql([37, 252, 255, 255]);
  });

  it('create negative int -1', function () {
    var a = new lib.MavlinkLib(255, 0);
    var f = a.createIntParamValue(-1);
    f.should.be.eql([255, 255, 255, 255]);
  });

  it('read positive float from msg', function () {
    var a = new lib.MavlinkLib(255, 0, null, 1);
    var msg = a.parseData(Buffer.from("fe19c6010116e0e9f6421704a1014d41565f504f535f4652455100000000096345", 'hex'));
    var r = a.readParamValue(msg[0]);
    r.should.be.eql(123.456787109375);
  });

  it('read negative float from msg', function () {
    var a = new lib.MavlinkLib(255, 0, null, 1);
    var msg = a.parseData(Buffer.from("fe19c0010116e0e976c417049b014d41565f4855445f4652455100000000092dbb", 'hex'));
    var r = a.readParamValue(msg[0]);
    r.should.be.eql(-987.654296875);
  });

  it('read positive int from msg', function () {
    var a = new lib.MavlinkLib(255, 0, null, 1);
    var msg = a.parseData(Buffer.from("fe19cb0101167b0000001704a6014d41565f544553545f5041520000000006ba4a", 'hex'));
    var r = a.readParamValue(msg[0]);
    r.should.be.eql(123);
  });

  it('read negative int from msg', function () {
    var a = new lib.MavlinkLib(255, 0, null, 1);
    var msg = a.parseData(Buffer.from("fe19ce01011625fcffff1704a9014d41565f5649535f4445425547000000060ebd", 'hex'));
    var r = a.readParamValue(msg[0]);
    r.should.be.eql(-987);
  });

  it('create float param_set message', function () {
    var a = new lib.MavlinkLib(255, 0, null, 1);
    var msg = a.createParamSetMessage("MAV_HUD_FREQ", -987.654321, true);

    msg.param_type.should.be.eql(9);
    msg.param_value.should.be.eql([224, 233, 118, 196]);
    msg.param_id.should.be.eql("MAV_HUD_FREQ");
  });

  it('create int param_set message', function () {
    var a = new lib.MavlinkLib(255, 0, null, 1);
    var msg = a.createParamSetMessage("MAV_TEST_PAR", 123, false);

    msg.param_type.should.be.eql(6);
    msg.param_value.should.be.eql([123, 0, 0, 0]);
    msg.param_id.should.be.eql("MAV_TEST_PAR");
  });

});
