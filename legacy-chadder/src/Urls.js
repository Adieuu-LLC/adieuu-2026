
//var d = "http://adieuu.student.rit.edu";
var d = "https://service.adieuu.im";
var api = d + "/api";
var signalr = d + "/SignalR";

var Account = api + "/Account";
var Login = Account + "/Login";
var Register = Account + "/Register";
var RequestUpdates = Account + "/RequestUpdates";
var Logout = Account + "/Logout/";

var UpdateKey = api + "/Device/UpdateKey";

module.exports = {
	domain : d,
	api : api,
	Account : Account,
	Login : Login,
	Register : Register,
	Logout : Logout,
    RequestUpdates : RequestUpdates,
	SignalR : signalr,
	UpdateKey : UpdateKey
}
