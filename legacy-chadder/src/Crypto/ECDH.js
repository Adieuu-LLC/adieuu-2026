/**
 * Created by Felipe on 4/9/2015.
 */
var db = require('./../DB.js');
var keys = require('./../Keys.js');
var content = require('./Content.js');

DeviceECDH.prototype = new content.Content;
DeviceECDH.prototype.constructor = DeviceECDH;
function DeviceECDH(reader) {

    if(reader === undefined)
        return;
    this.Type = content.Type.CT_ECDH_DEVICE;
    this.sourceId = reader.ReadShortString();
    this.targetId = reader.ReadShortString();

    if(this.sourceId == db.userId)
        this.user = db.GetDevice(this.sourceId);
    else
        this.user = db.GetDevice(this.targetId);
}

DeviceECDH.prototype.GetContent = function() {
    var pbk = keys.ECPubKey.fromBuffer(new Buffer(this.device.publicKey, 'base64'));
    return db.deviceKey.Agreement(pbk);
};

UserECDH.prototype = new content.Content;
UserECDH.prototype.constructor = UserECDH;
function UserECDH(reader) {
    if(reader === undefined)
        return;
    this.Type = content.Type.CT_ECDH_USER;
    if(typeof reader === 'string') {
        this.sourceId = db.userId;
        this.targetId = reader;
        this.user = db.GetUser(this.targetId);
    } else {
        this.sourceId = reader.ReadShortString();
        this.targetId = reader.ReadShortString();

        if(this.sourceId == db.userId)
            this.user = db.GetUser(this.targetId);
        else
            this.user = db.GetUser(this.sourceId);
    }
}

UserECDH.prototype.GetContent = function() {
    var pbk = keys.ECPubKey.fromBuffer(new Buffer(this.user.publicKey, 'base64'));
    return db.accountKey.Agreement(pbk);
};

UserECDH.prototype.WriteToBuffer = function(writer) {
    content.Content.prototype.WriteToBuffer.call(this, writer);
    writer.WriteShortString(this.sourceId);
    writer.WriteShortString(this.targetId);
};


module.exports = {
    DeviceECDH : DeviceECDH,
    UserECDH : UserECDH
};