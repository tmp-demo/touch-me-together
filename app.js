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

	if (app.get('env') === 'development')
		app.use(morgan('dev'));
		
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
	var audioDiff = 0;
	var currentStage = 0;

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
						currentStage = 0;
						send(socket, ['master']);
						broadcast(['stage', currentStage]);
					}
					break;
				
				case 'ping':
					if (isMaster) {
						audioDiff = message[1] - Date.now();
					}
					send(socket, ['pong', audioDiff + Date.now()]);
					break;
				
				case 'stage':
					currentStage = message[1];
					broadcast(['stage', currentStage], socket);
					break;

				case 'summary':
					broadcast(['score'], socket);
					setTimeout(function() {
						var clients = Object.keys(server.clients).map(function(id) {
							return server.clients[id];
						});
						clients.sort(function(a, b) {
							return a.score - b.score;
						});
						var playerCount = clients.length - 1;
						clients.forEach(function(client, i) {
							if (client === socket) {
								client.send(JSON.stringify(['summary', playerCount]));
							} else {
								client.send(JSON.stringify(['rank', i, playerCount]));
							}
						});
					}, 2000);
					break;

				default:
					console.log('unknown', message);
					break;
			}
		});
	});
/*
	var conns = [];

	function send(conn, args) {
		return conn.write(JSON.stringify(args));
	}

	function broadcast(args, except) {
		var message = JSON.stringify(args);
		
		conns.forEach(function(conn) {
			if (conn && i !== except) {
				conn.write(message);
			}
		});
	};

	sock.on('connection', function(conn) {
		conns.push(conn);

		conn.on('data', function(data) {
			try {
				var message = JSON.parse(data);
			} catch (err) {
				console.warn(data);
				return console.error(err);
			}
			
			switch (message[0]) {
				case 'ping':
					send(conn, ['pong']);
				conn.write("e", "f")
					break;
				
				default:
					console.log('unknown', message);
					break;
			}
		});
		
		conn.on('close', function() {
			var index = conns.indexOf(conn);
			conns.splice(index, 1);
		});
	});
*/
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
