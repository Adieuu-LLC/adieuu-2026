/**
 * Created by Felipe on 4/9/2015.
 */

var db = require('./../DB.js')

function UserKey(reader) {
    this.from = reader.ReadGuid();
    this.to = reader.ReadGuid();
    this.time = reader.ReadDate();
    this.data = reader.ReadBinary();
}

UserKey.prototype.Process = function() {
    var key = keys.ECKey.fromByteArray(this.data);
    db.accountKey = key;
    var device = db.GetDevice(this.to);
    device.hasUserKey = true;
    db.Save();
}