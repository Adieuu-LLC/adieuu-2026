/**
 * Created by Felipe on 4/9/2015.
 */
var crypto = require('crypto');
var content = require('./Content.js');
var binReader = require('./../BinReader.js');


ChadderAESContent.prototype = new content.Content;
ChadderAESContent.prototype.constructor = ChadderAESContent;
function ChadderAESContent(reader, key) {
    if(reader === undefined)
        return;
    // If reader is not BinReader than it is the content
    this.Type = content.Type.CT_AES;
    if(reader instanceof binReader) {
        this.iv = reader.ReadBinary(16);
        this.key = content.Deserialize(reader);
        this.encryptedContent = reader.ReadBinary();
    }
    else
    {
        this.iv = crypto.randomBytes(16);
        this.content = reader;
        this.key = key;
    }
}

ChadderAESContent.prototype.Decrypt = function() {
    var agreement = this.key.GetContent();
    var cipher = crypto.createDecipheriv('aes-256-cbc', agreement, this.iv);
    var result = cipher.update(this.encryptedContent.toString('base64'), 'base64', 'base64');
    var temp = new Buffer(result, 'base64');
    result = cipher.final('base64');
    var b = Buffer.concat([temp, new Buffer(result, 'base64')]);
    var reader = new binReader(b);
    return content.Deserialize(reader);
};

ChadderAESContent.prototype.Encrypt = function() {
    var agreement = this.key.GetContent();
    var cipher = crypto.createCipheriv('aes-256-cbc', agreement, this.iv);
    var result = cipher.update(this.content.Serialize().toString('base64'), 'base64', 'base64');
    var temp = new Buffer(result, 'base64');
    result = cipher.final('base64');
    this.encryptedContent = Buffer.concat([temp, new Buffer(result, 'base64')]);
};

ChadderAESContent.prototype.GetContent = function() {
    return this.Decrypt().GetContent();
};

ChadderAESContent.prototype.WriteToBuffer = function(writer) {
    content.Content.prototype.WriteToBuffer.call(this, writer);
    writer.WriteBinary(this.iv, 16);
    this.key.WriteToBuffer(writer);
    if(this.encryptedContent === undefined)
        this.Encrypt();
    writer.WriteBinary(this.encryptedContent);
};

module.exports = ChadderAESContent;