/**
 * Created by Felipe on 4/10/2015.
 */

function BinWriter() {
    this.buffer = new Buffer(2048); // Size limited to 2048
    this.offset = 0;
}

BinWriter.prototype.WriteInt = function(i) {
    this.buffer.writeUInt32LE(i, this.offset);
    this.offset += 4;
    return i;
};

BinWriter.prototype.WriteBinary = function(bin, size) {
    size = size || this.WriteInt(bin.length);
    bin.copy(this.buffer, this.offset, 0, size);
    this.offset += size;
};

BinWriter.prototype.WriteShortString = function(str) {
    this.buffer.writeUInt8(str.length, this.offset);
    this.offset += 1;
    this.buffer.write(str, this.offset);
    this.offset += str.length;
};

module.exports = BinWriter;