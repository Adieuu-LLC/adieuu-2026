/**
 * Created by Felipe on 3/8/2015.
 */


var urls = require('./urls.js');
var db = require('./DB.js');
var crypto = require('./Crypto.js');
var binReader = require('./BinReader.js');

var ChangeType = {
    RESERVED : 0,
    CONTACT : 1,
    CONVERSATION : 2,
    CONVERSATION_MEMBERSHIP : 3,
    MESSAGE : 4,
    DEVICE : 5,
    PROFILE : 6
};

var ChangeEvent = {
    RESERVED : 0,
    NEW : 1,
    UPDATE : 2,
    DELETE : 3
};



function RequestUpdates() {
    var lastUpdate = localStorage.lastUpdate;
    if(!lastUpdate) lastUpdate = 0;
    $.ajax({
        type : "POST",
        contentType: "application/json",
        url: urls.RequestUpdates,
        data: JSON.stringify({ lastUpdate : lastUpdate }),
        headers : {
            "Authorization" : "Bearer " + db.token
        },
        success : function(result) {
            if(result.error == 1) {
                result.updates.forEach(function(entry){
                    if(entry.type == ChangeType.DEVICE) {
                        if(entry.e == ChangeEvent.DELETE)
                            db.RemoveDevice(entry.o);
                        else
                            db.AddDevice(entry.o);
                    } else if(entry.type == ChangeType.MESSAGE) {
                        ProcessMessage(new Buffer(entry.o, 'base64'));
                    } else if(entry.type == ChangeType.CONTACT) {
						db.UpdateContact(entry.o);
					}
					localStorage.lastUpdate = entry.id;
                })
            }
            console.log(result);
        }
    })
}



function ProcessMessage(bin) {
    console.log(bin);
}

function EncryptForUser(userId, bin) {
    if(typeof bin == 'string')
        bin = new Buffer(bin, 'utf8');
    var plain = new crypto.Plain(bin);
    var key = new crypto.UserECDH(userId);
    var aes = new crypto.AES(plain, key);
    return aes.Serialize().toString('base64')
}

function Decrypt(str) {
	try {
		var b = new Buffer(str, 'base64');
		var reader= new binReader(b);
		var packed = crypto.Deserialize(reader);
		return packed.GetContent().toString();
	} catch(err) {}
}


module.exports = {
    RequestUpdates : RequestUpdates,
    EncryptForUser : EncryptForUser,
    Decrypt : Decrypt
};

