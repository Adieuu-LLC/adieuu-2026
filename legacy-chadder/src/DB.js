var keys = require('./Keys.js')
var BigInteger = require('bigi')

function DB() {
}

DB.prototype.Load = function () {
	if(this.token)
		return;
	this.token = localStorage.token;
	if(this.token) {
        this.userId = localStorage.userId;
        this.deviceId = localStorage.deviceId;
        this.userDeviceId = localStorage.userDeviceId;
		var d = new BigInteger(localStorage.deviceKey, 16);
		this.deviceKey = new keys.ECKey(d, false);
		this.Devices = JSON.parse(localStorage.Devices);
		this.Contacts = JSON.parse(localStorage.Contacts);

        if(localStorage.accountKey)
            this.accountKey = new keys.ECKey(new BigInteger(localStorage.accountKey, 16), false);
	}
}

DB.prototype.Save = function () {
    localStorage.token = this.token;
    localStorage.userId = this.userId;
    localStorage.deviceId = this.deviceId;
    localStorage.userDeviceId = this.userDeviceId;
	localStorage.deviceKey = this.deviceKey.d.toString(16);
    SaveDevices();
	localStorage.Contacts = JSON.stringify(this.Contacts);
    if(database.accountKey != null)
        localStorage.accountKey = database.accountKey.d.toString(16);
    else if(localStorage.accountKey)
        localStorage.removeItem("accountKey");
}

DB.prototype.GetDevice = function(id) {
    for(i = 0;i<this.Devices.length;++i) {
        if(this.Devices[i].id == id){
            return this.Devices[i];
        }
    }
    return undefined;
}

DB.prototype.UpdateContact = function(o) {
    for(i = 0;i<this.Contacts.length;++i) {
        if(this.Contacts[i].id == o.id){
            this.Contacts[i] = o;
			this.Save();
			break;
        }
    }
    this.Contacts.push(o);
	this.Save();
}

DB.prototype.GetUser = function(id) {
    for(i = 0;i<this.Contacts.length;++i) {
        if(this.Contacts[i].id == id){
            return this.Contacts[i];
        }
    }
    return undefined;
}

DB.prototype.RemoveDevice = function(id) {
    var i = 0;
    for(i = 0;i<this.Devices.length;++i) {
        if(this.Devices[i].id == id){
            this.Devices.splice(i, 1);
            break;
        }
    }
    SaveDevices();
}

DB.prototype.AddDevice = function(o) {
    var device = this.GetDevice(o.id);
    if(device) {
        device.name = o.name;
        device.hasUserKey = o.hasUserKey;
    }
    else
        this.Devices.push(o);
    SaveDevices();
}

function SaveDevices() {
    localStorage.Devices = JSON.stringify(database.Devices);
}

DB.prototype.Clear = function() {
    localStorage.clear();
    delete this.token;
    delete this.userId;
    delete this.deviceId;
    delete this.userDeviceId;
    delete this.deviceKey;
    delete this.Devices;
    delete this.Contacts;
    delete this.accountKey;
}

var database = new DB();
module.exports = database;