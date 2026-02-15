var keys = require('./Keys.js')
var urls = require('./urls.js')
var db = require('./DB.js')
var uuid = require('node-uuid');
var $ = require('jquery');

function Login(username, password, deviceName) {
	return new Promise(function(resolve,reject) {
		if(!db.token)
			db.Load();
		if(db.token)
			resolve(1);
		if(deviceName === undefined) deviceName = "JSClient";
		db.deviceId = uuid.v4();
		db.deviceKey = keys.ECKey.makeRandom(false);
		var data = {
			UserName : username,
			Password : password,
			Device : {
				DeviceID : db.deviceId,
				DeviceName : deviceName,
				DeviceKey : db.deviceKey.pub.toBase64(),
				Type : 0 // Reserved, make later
			}
		};
		$.ajax({
			type : "POST",
			contentType: "application/json",
			url: urls.Login,
			data: JSON.stringify(data),
			success : function(result) {
				if(result.error == 1) {
					db.token = result.token;
					db.userId = result.user.id;
					db.userDeviceId = result.device.id;
					db.Contacts = result.contacts;
					db.Devices = result.devices;
					db.Save();
					resolve(result.error);
				}
				reject(result.error);
			}, error : function(jqXHR, textStatus, errorThrown) {
				reject(false);
			}
		})
	});
}

function Logout() {
	return new Promise(function(resolve,reject) {
		$.ajax({
			type : "POST",
			contentType: "application/json",
			url: urls.Logout,
			data: JSON.stringify({ keepData : false }),
			headers : {
				"Authorization" : "Bearer " + db.token
			}
		}).done(function(data) {
			db.Clear();
			resolve(1);
		});
	});
}


function NewKey() {
	return new Promise(function(resolve,reject) {
		db.accountKey = keys.ECKey.makeRandom(false);
		var data = {
			data : db.accountKey.pub.toBase64()
		};
		var q = $.ajax({
			type : "POST",
			contentType: "application/json",
			url: urls.UpdateKey,
			data: JSON.stringify(data),
			headers : {
				"Authorization" : "Bearer " + db.token
			},
			success : function(result) {
				if(result.status == true) {
					db.Save();

					resolve(result.error);
				} else {
					reject(result.error);
				}
				console.log(result);
			}
		})
	});
}

function Register(username, password, deviceName) {
	return new Promise(function(resolve,reject) {
		if(deviceName === undefined) deviceName = "JSClient";
		db.deviceId = uuid.v4();
		db.deviceKey = keys.ECKey.makeRandom(false);
		db.accountKey = keys.ECKey.makeRandom(false);
		var data = {
			UserName : username,
			Password : password,
			Name : username,
			PublicKey : db.accountKey.pub.toBase64(),
			Device : {
				DeviceID : db.deviceId,
				DeviceName : deviceName,
				DeviceKey : db.deviceKey.pub.toBase64(),
				Type : 0, // Reserved, make later
			}
		};
		$.ajax({
			type : "POST",
			contentType: "application/json",
			url: urls.Register,
			data: JSON.stringify(data),
			success : function(result) {
				if(result.error == 1) {
					db.token = result.token;
					db.userId = result.user.id;
					db.userDeviceId = result.device.id;
					db.Contacts = result.contacts;
					db.Devices = result.devices;
					db.Save();

					resolve(result.error);
				} else {
					reject(result.error);
				}
			},
			error : function(jqXHR, textStatus, errorThrown) {
				reject(false);
			}
		})
	});
}

module.exports = {
	Login : Login,
	Register : Register,
	Logout : Logout,
	NewKey : NewKey
}