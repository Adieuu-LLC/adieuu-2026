/**
 * Created by Felipe on 3/10/2015.
 */
var binReader = require('./../BinReader.js');
var BinWriter = require('./../BinWriter.js');
var CONTENT_TYPE = {    CT_RESERVED:0,
    CT_PLAIN:1, CT_MESSAGE_TEXT_LEGACY : 2, CT_PICTURE_LEGACY : 3, CT_USER_KEY : 4, CT_MESSAGE_IMAGE_LEGACY : 5, CT_TIMED_IMAGE_LEGACY : 6, CT_MESSAGE_TEXT : 7, CT_MESSAGE_IMAGE : 8,
    CT_AES:0x01000001, CT_RSA : 0x01000002, CT_AES_PASSWORD : 0x01000003, CT_AES_KEYLESS : 0x01000004,
    CT_ECDH_USER_USER_LEGACY:0x02000001, CT_ECDH_DEVICE_DEVICE_LEGACY : 0x02000002, CT_SHA256_ACCOUNT_KEY : 0x02000003, CT_ECDH_USER : 0x02000004, CT_ECDH_DEVICE : 0x02000005,
    CT_RSA_SIGNED : 0x03000001, CT_ECC_SIGNED_LEGACY : 0x03000002, CT_ECDSA_SIGNED : 0x03000003,
    CT_DELETE_MSGS_LEGACY : 0x04000001, CT_DELETE_MSGS : 0x04000002
};

var TYPE_CONTRUCTORS = {};


function Content() {

}

Content.prototype.Serialize = function() {
    var binWriter = new BinWriter();

    this.WriteToBuffer(binWriter);

    return binWriter.buffer.slice(0, binWriter.offset);
};

Content.prototype.WriteToBuffer = function(writer) {
    writer.WriteInt(this.Type);
};

PlainContent.prototype = new Content;
PlainContent.prototype.constructor = PlainContent;
function PlainContent(reader) {
    if(reader === undefined)
        return;
    this.Type = CONTENT_TYPE.CT_PLAIN;
    if(reader instanceof binReader) {
        this.Content = reader.ReadBinary();
    } else {
        this.Content = reader;
    }
}
PlainContent.prototype.WriteToBuffer = function(writer) {
    Content.prototype.WriteToBuffer.call(this, writer);
    writer.WriteBinary(this.Content);
};

PlainContent.prototype.GetContent = function() {
    return this.Content;
};
function Deserialize(reader) {
    var type = reader.ReadInt();

    return new TYPE_CONTRUCTORS[type](reader);
}

function DeserializeBase64(str) {
    return Deserialize(new binReader(new Buffer(str, 'base64')));
}

module.exports = {
    Deserialize : Deserialize,
    TYPE_CONTRUCTORS : TYPE_CONTRUCTORS,
    Type : CONTENT_TYPE,
    Content : Content,
    Plain : PlainContent,
    DeserializeBase64 : DeserializeBase64
};