var bitcoin = require('bitcoinjs-lib')
var BigInteger = require('bigi')

bitcoin.ECPubKey.prototype.toBase64 = function() {
	return this.toBuffer().toString("base64");
}

bitcoin.ECKey.fromByteArray = function(data) {
    return new bitcoin.ECKey(BigInteger.fromBuffer(new Buffer(data)), false);
}

bitcoin.ECKey.prototype.Agreement = function(pbk) {
	var temp = pbk.Q.multiply(this.d).affineX.toByteArray();
	return bitcoin.crypto.sha256(new Buffer(temp));
}

module.exports = {
	ECKey : bitcoin.ECKey,
	ECPubKey : bitcoin.ECPubKey,
}