var async = require("async");
var config = require('config-path')(__dirname + "/config.yml");
var engine = require('engine.io');
var errorhandler = require("errorhandler");
var express = require("express");
var fs = require("fs");
var http = require("http");
var morgan = require("morgan");
var path = require("path");
var util = require("util");

module.exports = function(options, callback) {
	var app = express();

	var publicDir = path.join(__dirname, "public");
	
	if (options.trustProxy)
		app.enable('trust proxy');
	
	// app.use(bodyParser.json());
	
	app.get("/shaders.js", function(req, res, next) {
		var shadersDir = path.join(publicDir, "shaders.js");
		return fs.readdir(shadersDir, function(err, files) {
			if (err) return next(err);
			
			var shaders = {
				vertex: {},
				fragment: {}
			};
			
			return async.each(files, function(file, callback) {
				var parts = file.split(".");
				
				if (parts[1] === 'vsh') {
					return fs.readFile(path.join(shadersDir, file), function(err, data) {
						if (err) return callback(err);
						
						shaders.vertex[parts[0]] = data.toString();
						return callback();
					});
				} else if (parts[1] === 'fsh') {
					return fs.readFile(path.join(shadersDir, file), function(err, data) {
						if (err) return callback(err);
						
						shaders.fragment[parts[0]] = data.toString();
						return callback();
					});
				} else
					return callback();
			}, function(err) {
				if (err) return next(err);
				
				res.type('js');
				res.send(util.format("var shaderSources = %j;", shaders))
			});
		});
	});
	
	app.use(express.static(publicDir));
	
	app.use(errorhandler());
	
	var httpServer = http.createServer(app);
	// sock.installHandlers(server);
	var server = engine.attach(httpServer);
	var audioDiff = - Date.now();
	var currentStage = 0;

	var master;

	function send(socket, args) {
		return socket.send(JSON.stringify(args));
	}

	function broadcast(args, except) {
		var message = JSON.stringify(args);
		
		Object.keys(server.clients).forEach(function(id) {
			var socket = server.clients[id];
			if (socket !== except) {
				socket.send(message);
			}
		});
	};

	server.on('connection', function(socket) {
		var isMaster = false;
		socket.score = 0;

		send(socket, ['stage', currentStage]);
		
		socket.on('data', function(message) {
			try {
				message = JSON.parse(message);
			} catch (err) {
				console.warn(message);
				return console.error(err);
			}
			
			switch (message[0]) {
				case 'auth':
					if (message[1] === config.masterPassword) {
						isMaster = true;
						master = socket;
						currentStage = 0;
						send(socket, ['master']);
						broadcast(['stage', currentStage]);
						Object.keys(server.clients).forEach(function(id) {
							server.clients[id].score = 0;
						});
					}
					break;
				
				case 'name':
					socket.name = message[1].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
					if (master)
						send(master, ['player', socket.name]);
					break;
					
				case 'ping':
					if (isMaster && message[1]) {
						audioDiff = message[1] - Date.now();
					}
					send(socket, ['pong', audioDiff + Date.now()]);
					break;
				
				case 'score':
					if (!isMaster)
						socket.score = message[1];
					break;

				case 'stage':
					currentStage = message[1];
					broadcast(['stage', currentStage], socket);
					break;

				case 'summary':
					broadcast(['score'], socket);
					setTimeout(function() {
						socket.score = 0;
						var clients = Object.keys(server.clients).map(function(id) {
							return server.clients[id];
						}).filter(function(client) {
							return client.score > 1;
						});
						clients.sort(function(a, b) {
							return b.score - a.score;
						});
						var playerCount = clients.length;
						socket.send(JSON.stringify(['summary', playerCount]));
						clients.forEach(function(client, i) {
							console.log("#%d: %s", i, client.name);
							if (i < 3)
								socket.send(JSON.stringify(['rankName', i, client.name]));
							client.send(JSON.stringify(['rank', i, playerCount]));
						});
					}, 2000);
					break;

				default:
					console.log('unknown', message);
					break;
			}
		});
	});

	return callback(null, httpServer, app);
};

if (require.main === module) {
	module.exports(config, function(err, server, app) {
		if (err) throw err;
		
		var port = process.env.PORT || config.port;
		server.listen(port, function(){
			console.log("Server listening on port %d in mode %s", port, app.get('env'));
		});
	});
}
