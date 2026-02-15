/**
 * Created by Felipe on 3/10/2015.
 */

function BinReader(buffer) {
    this.buffer = buffer;
    this.offset = 0;
}

BinReader.prototype.ReadInt= function(){
    var offset = this.offset;
    this.offset += 4;
    return this.buffer.readUInt32LE(offset);
};


BinReader.prototype.ReadBinary = function(size) {
    size = size || this.ReadInt();

    var offset = this.offset;
    this.offset += size;
    return this.buffer.slice(offset, offset+size);
};

BinReader.prototype.ReadDate = function() {
    var low = this.ReadInt() / 10000;
    var high = (this.ReadInt() * 0x100000000 / 10000) ;
    var ticks = high + low;
    var date = new Date(ticks);
    date.setYear(date.getFullYear()-1969);
    return date;
};

BinReader.prototype.ReadShortString = function() {
    var size = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    var offset = this.offset;
    this.offset += size;
    return this.buffer.toString('utf8', offset, offset+size);
};

module.exports = BinReader;