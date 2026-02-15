/**
 * Created by Felipe on 4/9/2015.
 */

var content = require("./Crypto/Content.js");
var aes = require("./Crypto/AESContent.js");
var ecdh = require("./Crypto/ECDH.js");

content.TYPE_CONTRUCTORS[content.Type.CT_PLAIN] = content.Plain;

content.TYPE_CONTRUCTORS[content.Type.CT_AES] = aes;
content.TYPE_CONTRUCTORS[content.Type.CT_ECDH_USER] = ecdh.UserECDH;
content.TYPE_CONTRUCTORS[content.Type.CT_ECDH_DEVICE] = ecdh.DeviceECDH;

module.exports = {
    Deserialize : content.Deserialize,
    AES : aes,
    UserECDH : ecdh.UserECDH,
    Plain : content.Plain
};