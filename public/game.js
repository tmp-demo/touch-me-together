function HSVtoRGB(h, s, v) {
    var r, g, b, i, f, p, q, t;
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return [r, g, b];
}

function quadGeometry(gl) {
	var attributes = new Float32Array([
		- 0.5, - 0.5, 
		  0.5, - 0.5,
		  0.5,   0.5,
		- 0.5,   0.5,
	]);
	
	var arrayBuffer = gl.createBuffer();
	
	gl.bindBuffer(gl.ARRAY_BUFFER, arrayBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, attributes, gl.STATIC_DRAW);
	
	return {
		array: arrayBuffer
	};
}

function game() {
	try {
		var container = document.getElementById('game');
		var canvas = document.createElement('canvas');
		var gl = this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
	} catch (err) {
		return console.error(err);
	}
	
	container.appendChild(canvas);

	var geometries = {
		quad: quadGeometry(gl),
	};
	
	generateGeometry(gl);
	
	var lineGeometry = generateLineGeometry(gl, [-100, 0, 0], [100, 0, 0], 50);
	// var cubeGeometries = generateWireframeCubeGeometries(gl);

	var programs = createPrograms(gl, {
		bg: ['fullscreen', 'bg'],
		cursor: ['billboard', 'cursor'],
		line: ['line', 'line'],
		slide: ['timedline', 'slide'],
		touch: ['billboard', 'touch'],
		track: ['timedline', 'track'],
		trail: ['billboard', 'trail'],
	});
	
	var identityMatrix = mat4.create();

	var cameraViewMatrix = mat4.create();
	var cameraProjectionMatrix = mat4.create();
	var cameraProjectionViewMatrix = mat4.create();
	var inverseProjectionViewMatrix = mat4.create();
	var cameraAspect;
	var cameraFov = 1.2;
	var cameraPosition;
	var cameraTarget;
	var cameraTilt;

	var squareScale;

	var trailCameraViewMatrix = mat4.create();
	var trailCameraProjectionViewMatrix = mat4.create();
	mat4.lookAt(trailCameraViewMatrix, [0, 0, 0.3], [0, 0, 0], [0, 1, 0]);

	function updateCameraProjectionMatrix() {
		if (cameraAspect > 1)
			mat4.perspective(cameraProjectionMatrix, cameraFov, cameraAspect, 0.1, 100);
		else
			mat4.perspectiveX(cameraProjectionMatrix, cameraFov, cameraAspect, 0.1, 100);

		mat4.multiply(trailCameraProjectionViewMatrix, cameraProjectionMatrix, trailCameraViewMatrix);
	}

	function onWindowResize(event) {
		var width = window.innerWidth;
		var height = window.innerHeight;
		cameraAspect = width / height;
		
		canvas.width = width;
		canvas.height = height;
		
		container.style.width = width + "px";
		container.style.height = height + "px";

		gl.viewport(0, 0, width, height);

		squareScale = (width > height ? [1 / cameraAspect, 1] : [1, cameraAspect]);

		return updateCameraProjectionMatrix();
	}
	
	window.addEventListener('resize', onWindowResize);
	onWindowResize();
	
	var touches = [];
	var slides = [];
	song.notes.forEach(function(note) {
		note.originPosition = note.position;
		note.opacity = new PFloat(1, PFloat.LINEAR, 4);
		note.scale = new PFloat(0.2, PFloat.LINEAR, 4);
		if (note.segments) {
			note.trailOpacity = new PFloat(0.8, PFloat.LINEAR, 4);
			slides.push(note);
		} else
			touches.push(note);
	});

	function resetNotes() {
		song.notes.forEach(function(note) {
			note.position = note.originPosition;
			note.opacity.current = note.opacity.target = 1;
			note.scale.current = note.scale.target = 0.2;
			note.inProgress = false;
			note.identifier = null;
			note.scored = false;

			if (note.segments) {
				note.trailOpacity.current = note.trailOpacity.target = 0.8;
			}
		});
	}

	var audioCtx;
	var audioBuffer;
	var audioStartTime;

	var pingTime;
	var serverHalfPing = 0;
	var pingTimeout;

	var socket;
	var isMaster = false;
	var isPlaying = false;
	var hasJoined = false;

	var currentChunk, nextChunk;
	var fadeConstant = 0.2;
	var currentStage = 0;
	var currentStageTarget = 0;
	var currentMasterStage = 0;

	function toMusicalTime(t) {
		return t / 60 * map.bpm;
	}

	function fromMusicalTime(t) {
		return t * 60 / map.bpm;
	}

	var touchLatency = fromMusicalTime(0.1);

	function pushNextSource(nextStage) {
		var gainNode = audioCtx.createGain();
		var sourceNode = audioCtx.createBufferSource();
		sourceNode.buffer = audioBuffer;
		sourceNode.connect(gainNode);
		gainNode.connect(audioCtx.destination);

		if (typeof nextStage === "undefined")
			nextStage = (map.stages[currentStage].loop ? currentStage : currentStage + 1);

		var offset = fromMusicalTime(map.stages[nextStage].from)
		var duration = fromMusicalTime(map.stages[nextStage].to - map.stages[nextStage].from)
		var endTime = currentChunk.endTime + duration
		sourceNode.start(currentChunk.endTime, offset, duration);
		console.log("push", nextStage, currentChunk.endTime, endTime, audioCtx.currentTime);

		nextChunk = {
			gainNode: gainNode,
			sourceNode: sourceNode,
			endTime: endTime
		};
	}

	function discardNextSource() {
		console.log("discard");
		nextChunk.sourceNode.disconnect();
		nextChunk.sourceNode.stop(audioCtx.currentTime);

		nextChunk.gainNode.disconnect();
		nextChunk.gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
	}

	function send(args) {
		return socket.send(JSON.stringify(args));
	}

	function sendPing() {
		pingTime = Date.now();
		if (isPlaying && audioCtx)
			send(['ping', Math.floor((audioCtx.currentTime - audioStartTime) * 1000 - serverHalfPing)]);
		else
			send(['ping']);
	}
	
	function connect() {
		socket = new eio.Socket();

		socket.on('open', function() {
			if (location.hash)
				send(['auth', location.hash.substr(1)]);
			else {
				document.getElementById("name").style.display = 'block';
				document.getElementById("nameInput").focus();
				document.getElementById("nameForm").addEventListener('submit', function(event) {
					event.preventDefault();
					var name = document.getElementById("nameInput").value.trim() || "Anonymous";
					send(['name', name]);
					document.getElementById("name").style.display = 'none';
					hasJoined = true;
				});
			}
			sendPing();
		});
		
		socket.on('message', function(message) {
			try {
				message = JSON.parse(message);
			} catch (err) {
				console.warn(message);
				return console.error(err);
			}
			
			console.log(message);
			
			switch (message[0]) {
				case 'master':
					if (!isMaster) {
						isMaster = true;
						hasJoined = true;
						document.getElementById("message").style.display = 'block';

						audioCtx = new (window.AudioContext || window.webkitAudioContext)();

						var request = new XMLHttpRequest();
						request.open("GET", "/revision15.ogg", true);
						request.responseType = "arraybuffer";

						request.onload = function() {
							if (request.status >= 400) {
								return load(extensionIndex + 1);
							}
							
							audioCtx.decodeAudioData(request.response, function(buffer) {
								if (!buffer) {
									return console.error('Error while decoding');
								}
								
								audioBuffer = buffer;
								audioStartTime = audioCtx.currentTime;
								isPlaying = true;
								resetNotes();
								currentStage = 0; // TODO
								currentStageTarget = 0;
								send(['stage', currentStage]);

								var gainNode = audioCtx.createGain();
								var sourceNode = audioCtx.createBufferSource();
								sourceNode.buffer = buffer;
								sourceNode.connect(gainNode);
								gainNode.connect(audioCtx.destination);

								var offset = fromMusicalTime(map.stages[currentStage].from)
								var duration = fromMusicalTime(map.stages[currentStage].to - map.stages[currentStage].from)
								var endTime = audioStartTime + duration
								sourceNode.start(audioCtx.currentTime, offset, duration);

								currentChunk = {
									gainNode: gainNode,
									sourceNode: sourceNode,
									endTime: endTime
								};

								// audioStartTime -= fromMusicalTime(80); // TODO

								pushNextSource();
							}, function() {
								console.error('Error while decoding');
							});
						}

						request.onerror = function(err) {
							console.error(err);
						}

						request.send();
					}
					break;
					
				case 'player':
					if (isPlaying)
						showFeedback("ok", message[1] + " joined");
					break;
					
				case 'pong':
					serverHalfPing = (Date.now() - pingTime) / 2;
					pingTimeout = setTimeout(sendPing, 500);

					clientMusicalTime = masterMusicalTime;
					masterMusicalTime = toMusicalTime((message[1] - serverHalfPing) / 1000);
					clientRatio = 1;
					break;
					
				case 'rank':
					if (!isPlaying) {
						document.getElementById("rank").style.display = "block";
						document.getElementById("playerRank").innerHTML = (message[1] + 1);
						document.getElementById("playerCount").innerHTML = message[2];
					}
					break;
					
				case 'rankName':
					if (isPlaying) {
						var element = document.createElement('div');
						element.innerHTML = "#" + (message[1] + 1) + " <em>" + message[2] + "</em>";
						document.getElementById("leaderboard").appendChild(element);
					}
					break;
					
				case 'score':
					if (!isPlaying)
						send(['score', score]);
					break;

				case 'stage':
					currentStage = currentMasterStage = message[1];
					break;

				case 'summary':
					if (isPlaying) {
						document.getElementById("summary").style.display = "block";
						document.getElementById("summaryPlayerCount").innerHTML = message[1];
					}
					break;

				default:
					console.log('unknown', message);
					break;
			}
		});
		
		socket.on('close', function() {
			clearTimeout(pingTimeout);
			pingTimeout = null;

			connect();
		});
	}

	connect();
	
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	
	var startTime = Date.now();
	var lastTime = 0;
	var time;
	var dt;
	
	var musicalTime = 0;
	var masterMusicalTime = 0;
	var clientMusicalTime = 0;
	var clientRatio = 0;

	var summaryRequested = false;

	function animate(keyframes) {
		return evalKeyframe(keyframes, musicalTime);
	}

	function render() {
		requestAnimationFrame(render);
		
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		
		gl.disable(gl.DEPTH_TEST);
		gl.depthMask(false);
		
		time = (Date.now() - startTime) / 1000;
		dt = time - lastTime;
		lastTime = time;

		if (isPlaying) {
			musicalTime = toMusicalTime(audioCtx.currentTime - audioStartTime);
			while (musicalTime >= map.stages[currentStage].to) {
				console.log("overflow")
				if (!map.stages[currentStage].loop || currentStageTarget > currentStage)
					++currentStage;
				else {
					var duration = map.stages[currentStage].to - map.stages[currentStage].from;
					musicalTime -= duration;
					audioStartTime += fromMusicalTime(duration);
					resetNotes();
				}
				currentChunk = nextChunk;
				pushNextSource();
			}
		}
		else {
			var dmt = toMusicalTime(dt);
			var duration = map.stages[currentStage].to - map.stages[currentStage].from;

			masterMusicalTime += dmt;
			while (masterMusicalTime >= map.stages[currentMasterStage].to) {
				if (!map.stages[currentMasterStage].loop)
					++currentMasterStage;
				else {
					masterMusicalTime -= duration;
					resetNotes();
				}
			}

			clientMusicalTime += dmt;
			while (clientMusicalTime >= map.stages[currentStage].to) {
				if (!map.stages[currentStage].loop)
					++currentStage;
				else {
					clientMusicalTime -= duration;
					resetNotes();
				}
			}

			var diff = masterMusicalTime - clientMusicalTime;
			if (diff >= duration / 2)
				diff -= duration;
			if (diff < - duration / 2)
				diff += duration;

			if (Math.abs(diff) > 1)
				clientMusicalTime = masterMusicalTime;

			if (clientRatio > 0)
				clientRatio = Math.max(clientRatio - dt * 5, 0);

			musicalTime = clientMusicalTime * clientRatio + masterMusicalTime * (1 - clientRatio);
		}
		
		if (musicalTime >= map.end && isPlaying && !summaryRequested) {
			summaryRequested = true;
			send(['summary']);
		}

		var fTime = musicalTime % 1;
		var beat = 1 - fTime * (1 - fTime) * 4;
		//var beat = Math.exp(-(musicalTime % 1));

		// console.log(musicalTime);

		var touchColor = [0, 0.47, 1];
		var touchAura = [0.22, 0.82, 1];

		var cursorColor = [1.0, 0.47, 0.03];
		var cursorAura = [1.0, 0.39, 0.39];

		var trackBeforeColor = [1.0, 1.0, 1.0];
		var trackBeforeAura = [0.8, 0.8, 1.0];
		var trackAfterColor = cursorColor;
		var trackAfterAura = cursorAura;

		cameraPosition = [
			animate(song.animations.cameraX),
			animate(song.animations.cameraY),
			animate(song.animations.cameraZ),
		]
		
		cameraTarget = [
			animate(song.animations.camTargetX),
			animate(song.animations.camTargetY),
			animate(song.animations.camTargetZ),
		]

		cameraTilt = -animate(song.animations.camTilt);

		// console.log(cameraPosition, cameraTarget, cameraTilt);
		mat4.lookAtTilt(cameraViewMatrix, cameraPosition, cameraTarget, [0,0,1], cameraTilt);

		mat4.multiply(cameraProjectionViewMatrix, cameraProjectionMatrix, cameraViewMatrix);
		mat4.invert(inverseProjectionViewMatrix, cameraProjectionViewMatrix);
		
		slides.forEach(function(note) {
			if (note.inProgress || musicalTime < note.time)
				note.segments.some(function(segment) {
					if (segment.from <= musicalTime && musicalTime < segment.to) {
						var t = (musicalTime - segment.from) / (segment.to - segment.from);
						note.position = [bezierLine(segment, 0, t), bezierLine(segment, 1, t), bezierLine(segment, 2, t)];
						return true;
					}
				});

			if (note.inProgress) {
				var fingerPosition = fingerPositions[note.identifier];
				updateClipPosition(note);
				// console.log(clipPosition, fingerPosition, vec2.squaredDistance(clipPosition, fingerPosition))
				if (vec2.squaredDistance(clipPosition, fingerPosition) > maxSquaredDistance)
				{
					note.inProgress = false;
					note.opacity.target = 0;
					note.trailOpacity.target = 0.2;
					navigator.vibrate(0);
				}	
			}

			note.opacity.update(dt);
			note.scale.update(dt);
			note.trailOpacity.update(dt);
		});

/*
		gl.bindBuffer(gl.ARRAY_BUFFER, geometries.quad.array);
		
		gl.useProgram(programs.bg.id);
		gl.vertexAttribPointer(programs.bg.position, 2, gl.FLOAT, false, 0, 0);

		gl.uniform3fv(programs.bg.cameraPosition, cameraPosition);
		gl.uniformMatrix4fv(programs.bg.viewMatrix, false, cameraViewMatrix);
		gl.uniformMatrix4fv(programs.bg.inverseProjectionViewMatrix, false, inverseProjectionViewMatrix);
		
		gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
*/
		// gl.enable(gl.DEPTH_TEST);
		// gl.depthMask(true);

		gl.disable(gl.DEPTH_TEST);
		gl.depthMask(false);
		
		// TRAILS

		gl.bindBuffer(gl.ARRAY_BUFFER, geometries.quad.array);
		
		gl.useProgram(programs.trail.id);
		gl.vertexAttribPointer(programs.trail.position, 2, gl.FLOAT, false, 0, 0);

		gl.uniformMatrix4fv(programs.trail.projectionViewMatrix, false, trailCameraProjectionViewMatrix);
		gl.uniform2fv(programs.trail.squareScale, squareScale);
		gl.uniform1f(programs.trail.opacity, 0.5);
		gl.uniform1f(programs.trail.scale, 0.1);

		trailPoints.forEach(function(point) {
			var x = point.center[0];
			var y = point.center[1];
			x = 0.5 - (x + musicalTime / 8) % 1; 
			y -= 0.5;
			gl.uniform3fv(programs.trail.center, [x, y, 0]);
			gl.uniform3fv(programs.trail.color, point.color);

			gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
		});

		// CUBES
		/*
		var offset = 2;
		var x = Math.floor(cameraTarget[0] / offset) * offset;
		var y = Math.floor(cameraTarget[1] / offset) * offset;
		var size = Float32Array.BYTES_PER_ELEMENT * 7;

		gl.useProgram(programs.line.id);
		gl.uniformMatrix4fv(programs.line.projectionMatrix, false, cameraProjectionMatrix);
		gl.uniformMatrix4fv(programs.line.viewMatrix, false, cameraViewMatrix);
		gl.uniform1f(programs.line.cameraAspect, cameraAspect);
		gl.uniform1f(programs.line.thickness, 0.1 * (1.0 + beat));
		gl.uniform3fv(programs.line.color, [1, 1, 1]);
		gl.uniform3fv(programs.line.aura, [1, 1, 1]);
		gl.uniform1f(programs.line.opacity, 1);;
		
		cubeGeometries.forEach(function(geometry) {
			gl.bindBuffer(gl.ARRAY_BUFFER, geometry.attributes);
			gl.vertexAttribPointer(programs.line.position, 3, gl.FLOAT, false, size, 0);
			gl.vertexAttribPointer(programs.line.direction, 3, gl.FLOAT, false, size, Float32Array.BYTES_PER_ELEMENT * 3);
			gl.vertexAttribPointer(programs.line.side, 1, gl.FLOAT, false, size, Float32Array.BYTES_PER_ELEMENT * 6);

			for (var i = - 2; i <= 2; ++i)
				for (var j = - 2; j <= 2; ++j) {
					var modelMatrix = mat4.create();
					mat4.translate(modelMatrix, modelMatrix, [x + i * offset, y + j * offset, -2]);
					gl.uniformMatrix4fv(programs.line.modelMatrix, false, modelMatrix);

					gl.drawArrays(gl.TRIANGLE_STRIP, 0, geometry.vertexCount);
				}
		});
		*/
		// LINES

		var offset = 2;
		var x = (Math.floor(cameraTarget[0] / offset) + 0.5) * offset;
		var y = (Math.floor(cameraTarget[1] / offset) + 0.5) * offset;
		var size = Float32Array.BYTES_PER_ELEMENT * 7;

		gl.useProgram(programs.line.id);
		gl.uniformMatrix4fv(programs.line.projectionMatrix, false, cameraProjectionMatrix);
		gl.uniformMatrix4fv(programs.line.viewMatrix, false, cameraViewMatrix);
		gl.uniform1f(programs.line.cameraAspect, cameraAspect);
		gl.uniform1f(programs.line.thickness, 0.1 * (1.0 + beat));
		gl.uniform3fv(programs.line.color, [1, 1, 1]);
		gl.uniform3fv(programs.line.aura, [1, 1, 1]);
		gl.uniform1f(programs.line.opacity, 1);
		
		gl.bindBuffer(gl.ARRAY_BUFFER, lineGeometry.attributes);
		gl.vertexAttribPointer(programs.line.position, 3, gl.FLOAT, false, size, 0);
		gl.vertexAttribPointer(programs.line.direction, 3, gl.FLOAT, false, size, Float32Array.BYTES_PER_ELEMENT * 3);
		gl.vertexAttribPointer(programs.line.side, 1, gl.FLOAT, false, size, Float32Array.BYTES_PER_ELEMENT * 6);

		for (var i = - 10; i <= 10; ++i) {
			var modelMatrix = mat4.create();
			// mat4.rotateZ(modelMatrix, modelMatrix, Math.PI / 4);
			mat4.translate(modelMatrix, modelMatrix, [x + i * offset, y + i * offset, -1]);
			gl.uniformMatrix4fv(programs.line.modelMatrix, false, modelMatrix);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, lineGeometry.vertexCount);

			mat4.rotateZ(modelMatrix, modelMatrix, Math.PI / 2);
			gl.uniformMatrix4fv(programs.line.modelMatrix, false, modelMatrix);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, lineGeometry.vertexCount);

		}

		if (musicalTime < 80) {
			var margin = musicalTime > 48 ? (musicalTime - 48) * 0.5 : 0;
			
			for (var i = - 10; i <= 10; ++i) {
				var modelMatrix = mat4.create();
				mat4.rotateY(modelMatrix, modelMatrix, Math.PI / 2);
				mat4.translate(modelMatrix, modelMatrix, [1, y - 2 * offset + margin, x + i * offset]);
				gl.uniformMatrix4fv(programs.line.modelMatrix, false, modelMatrix);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, lineGeometry.vertexCount);

				mat4.translate(modelMatrix, modelMatrix, [0, 3 * offset - 2 * margin, 0]);
				gl.uniformMatrix4fv(programs.line.modelMatrix, false, modelMatrix);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, lineGeometry.vertexCount);

			}
		}
		
		// SLIDES

		var size = Float32Array.BYTES_PER_ELEMENT * 8;

		gl.useProgram(programs.slide.id);
		gl.uniformMatrix4fv(programs.slide.projectionViewMatrix, false, cameraProjectionViewMatrix);
		gl.uniformMatrix4fv(programs.slide.modelMatrix, false, identityMatrix);
		gl.uniform1f(programs.slide.cameraAspect, cameraAspect);
		gl.uniform1f(programs.slide.currentTime, musicalTime);
		gl.uniform1f(programs.slide.beat, beat);
		gl.uniform1f(programs.slide.thickness, 0.2);
		gl.uniform3fv(programs.slide.center, touchAura);
		gl.uniform3fv(programs.slide.outside, touchColor);
		
		slides.forEach(function(slide) {
			gl.uniform1f(programs.slide.trailOpacity, slide.trailOpacity.current);
			slide.segments.forEach(function(segment) {
				if (segment.from > musicalTime + 20 || segment.to < musicalTime - 10)
					return;

				gl.bindBuffer(gl.ARRAY_BUFFER, segment.attributes);
				gl.vertexAttribPointer(programs.slide.position, 3, gl.FLOAT, false, size, 0);
				gl.vertexAttribPointer(programs.slide.direction, 3, gl.FLOAT, false, size, Float32Array.BYTES_PER_ELEMENT * 3);
				gl.vertexAttribPointer(programs.slide.side, 1, gl.FLOAT, false, size, Float32Array.BYTES_PER_ELEMENT * 6);
				gl.vertexAttribPointer(programs.slide.time, 1, gl.FLOAT, false, size, Float32Array.BYTES_PER_ELEMENT * 7);
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, segment.vertexCount);
			});
		});

		// TRACKS

		gl.useProgram(programs.track.id);
		gl.uniformMatrix4fv(programs.track.projectionViewMatrix, false, cameraProjectionViewMatrix);
		gl.uniformMatrix4fv(programs.track.modelMatrix, false, identityMatrix);
		gl.uniform1f(programs.track.cameraAspect, cameraAspect);
		gl.uniform1f(programs.track.currentTime, musicalTime);
		gl.uniform1f(programs.track.beat, beat);
		gl.uniform1f(programs.track.thickness, 0.1 * (1.0 + beat));
		gl.uniform3fv(programs.track.beforeColor, trackBeforeColor);
		gl.uniform3fv(programs.track.beforeAura, trackBeforeAura);
		gl.uniform3fv(programs.track.afterColor, trackAfterColor);
		gl.uniform3fv(programs.track.afterAura, trackAfterAura);
		
		song.tracks.forEach(function(track) {
			if (track.from > musicalTime + 20 || track.to < musicalTime - 10)
				return;

			gl.bindBuffer(gl.ARRAY_BUFFER, track.attributes);
			gl.vertexAttribPointer(programs.track.position, 3, gl.FLOAT, false, size, 0);
			gl.vertexAttribPointer(programs.track.direction, 3, gl.FLOAT, false, size, Float32Array.BYTES_PER_ELEMENT * 3);
			gl.vertexAttribPointer(programs.track.side, 1, gl.FLOAT, false, size, Float32Array.BYTES_PER_ELEMENT * 6);
			gl.vertexAttribPointer(programs.track.time, 1, gl.FLOAT, false, size, Float32Array.BYTES_PER_ELEMENT * 7);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, track.vertexCount);
		})

		// NOTES

		gl.bindBuffer(gl.ARRAY_BUFFER, geometries.quad.array);
		
		gl.useProgram(programs.touch.id);
		gl.vertexAttribPointer(programs.touch.position, 2, gl.FLOAT, false, 0, 0);

		gl.uniformMatrix4fv(programs.touch.projectionViewMatrix, false, cameraProjectionViewMatrix);
		gl.uniform2fv(programs.touch.squareScale, squareScale);
		gl.uniform3fv(programs.touch.color, touchColor);
		gl.uniform3fv(programs.touch.aura, touchAura);

		slides.forEach(function(note) {
			if (note.time > musicalTime + 20 || note.time < musicalTime - 10)
				return;
			
			gl.uniform3fv(programs.touch.center, note.position);
			gl.uniform1f(programs.touch.opacity, note.opacity.current);
			gl.uniform1f(programs.touch.scale, 2 * note.scale.current * (3 + beat));

			gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
		});

		touches.forEach(function(note) {
			if (note.time > musicalTime + 20 || note.time < musicalTime - 10)
				return;

			note.opacity.update(dt);
			note.scale.update(dt);

			gl.uniform3fv(programs.touch.center, note.position);
			gl.uniform1f(programs.touch.opacity, note.opacity.current);
			gl.uniform1f(programs.touch.scale, 2 * note.scale.current * (3 + beat));

			gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
		});

		// CURSORS

		gl.useProgram(programs.cursor.id);
		gl.vertexAttribPointer(programs.cursor.position, 2, gl.FLOAT, false, 0, 0);

		gl.uniformMatrix4fv(programs.cursor.projectionViewMatrix, false, cameraProjectionViewMatrix);
		gl.uniform2fv(programs.cursor.squareScale, squareScale);
		gl.uniform1f(programs.cursor.scale, 0.4 * (3 + beat));
		gl.uniform3fv(programs.cursor.color, cursorColor);
		gl.uniform3fv(programs.cursor.aura, cursorAura);

		song.tracks.forEach(function(track) {
			if (track.from <= musicalTime && musicalTime < track.to) {
				var t = (musicalTime - track.from) / (track.to - track.from);
				var c = [bezierLine(track, 0, t), bezierLine(track, 1, t), bezierLine(track, 2, t)];
				gl.uniform3fv(programs.cursor.center, c);
				gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
			}
		})

	}

	var score = 0;

	var feedbackPool = [];
	for (var  i= 0; i < 30; ++i) {
		var element = document.createElement("div");
		container.appendChild(element);
		feedbackPool.push(element);
	}

	function showFeedback(className, feedback) {
		var element = feedbackPool.pop();
		element.className = "feedback " + className;
		element.innerHTML = feedback;
		setTimeout(function() {
			element.className = "";
			element.innerHTML = "";
			feedbackPool.push(element);
		}, 3000);
	}

	function addScore(inc) {
		if (map.stages[currentStage].score)
			score += inc;

		var className, feedback;
		if (inc > 0.75) {
			className = "perfect";
			feedback = "Perfect!";
			if (navigator.vibrate)
				navigator.vibrate(200);
		} else if (inc > 0.5) {
			className = "great";
			feedback = "Great!";
		} else if (inc > 0.25) {
			className = "good";
			feedback = "Good";
		} else {
			className = "ok";
			feedback = "OK!";
		}
		showFeedback(className, feedback);
	}

	var noteByIdentifiers = {};
	var fingerPositions = {};

	function updateFingerPosition(desc, identifier) {
		var width = window.innerWidth;
		var height = window.innerHeight;
		var fingerPosition = [desc.pageX / width * 2 - 1, -(desc.pageY / height * 2 - 1)];
		if (width > height)
			fingerPosition[0] *= cameraAspect;
		else
			fingerPosition[1] /= cameraAspect;
		fingerPositions[identifier] = fingerPosition;
		return fingerPosition;
	}

	var clipPosition = vec4.create();
	var maxSquaredDistance = 0.2;
	function updateClipPosition(note) {
		vec4.transformMat4(clipPosition, [note.position[0], note.position[1], note.position[2], 1], cameraProjectionViewMatrix);
		vec3.scale(clipPosition, clipPosition, 1 / clipPosition[3]);
		if (innerWidth > innerHeight)
			clipPosition[0] *= cameraAspect;
		else
			clipPosition[1] /= cameraAspect;
	}

	function touchStart(desc, identifier, latency) {
		var time = musicalTime - latency;

		fingerPosition = updateFingerPosition(desc, identifier);
		// console.log(fingerPosition);

		var notes = [];
		song.notes.forEach(function(note) {
			if (note.scored)
				return;

			var dt = Math.abs(note.time - time);
			if (dt <= 0.5) {
				updateClipPosition(note);
				var squaredDistance = vec2.squaredDistance(clipPosition, fingerPosition);
				// console.log(clipPosition, squaredDistance)
				if (squaredDistance < maxSquaredDistance)
				{
					note.dt = dt;
					note.score = dt + squaredDistance;
					notes.push(note);
				}
			}
		});

		if (notes.length) {
			notes.sort(function(a, b) {
				return a.score - b.score;
			});

			var note = notes[0];
			note.scored = true;
			// console.log(fromMusicalTime(note.dt));

			if (note.segments) {
				note.inProgress = true;
				note.identifier = identifier;
				note.scale.target = 0.5;
				note.firstScore = 1 - note.dt * 2;
				noteByIdentifiers[identifier] = note;

				if (navigator.vibrate)
					navigator.vibrate(fromMusicalTime(note.segments[note.segments.length - 1].to - note.segments[0].from));
			} else {
				addScore(1 - note.dt * 2);
				note.opacity.target = 0;
				note.scale.target = 0.5;
			}
		}
	}

	function touchMove(desc, identifier, latency) {
		updateFingerPosition(desc, identifier);
	}

	function touchEnd(desc, identifier, latency) {
		var time = musicalTime - latency;

		var note = noteByIdentifiers[identifier];
		if (note) {
			delete noteByIdentifiers[identifier];

			if (!note.inProgress)
				return ;

			note.inProgress = false;

			var ratio = (time - note.segments[0].from) / (note.segments[note.segments.length - 1].to - note.segments[0].from);
			// console.log(ratio);
			if (ratio < 0.8) {
				note.trailOpacity.target = 0.2;
			} else {
				addScore(note.firstScore);
				// note.scale.target = 1;
			}

			note.opacity.target = 0;
		}
	}

	window.addEventListener('keydown', function(event) {
		if (isPlaying) {
			// console.log(event.which);
			switch (event.which) {
				case 13: // enter
					if (document.activeElement.id !== "message")
						document.getElementById("message").focus();
					else
						document.activeElement.blur();
					break;
/*
				case 37: // left
					if (document.activeElement.id !== "message") {
						currentStage = currentStageTarget = Math.max(currentStage - 1, 0);
						send(['stage', currentStage]);
					}
					break;
*/
				case 39: // right
					if (document.activeElement.id !== "message") {
						discardNextSource();
						currentStageTarget = Math.min(currentStage + 1, map.stages.length - 1);
						pushNextSource(currentStageTarget);
						send(['stage', currentStageTarget]);
					}
					break;
			}
		}
	}, true);

	window.addEventListener("touchstart", function(event) {
		if (!hasJoined) return;
		event.preventDefault();
		for (var i = 0, n = event.changedTouches.length; i < n; ++i) {
			var touch = event.changedTouches[i];
			touchStart(touch, touch.identifier, touchLatency);
		}
	}, false);

	window.addEventListener("touchend", function(event) {
		if (!hasJoined) return;
		event.preventDefault();
		for (var i = 0, n = event.changedTouches.length; i < n; ++i) {
			var touch = event.changedTouches[i];
			touchEnd(touch, touch.identifier, touchLatency);
		}
	}, false);

	window.addEventListener("touchmove", function(event) {
		if (!hasJoined) return;
		event.preventDefault();
		for (var i = 0, n = event.changedTouches.length; i < n; ++i) {
			var touch = event.changedTouches[i];
			touchMove(touch, touch.identifier, touchLatency);
		}
	}, false);

	window.addEventListener("mousedown", function(event) {
		if (!hasJoined) return;
		event.preventDefault();
		return touchStart(event, "mouse", 0);
	}, false);

	window.addEventListener("mouseup", function(event) {
		if (!hasJoined) return;
		event.preventDefault();
		return touchEnd(event, "mouse", 0);
	}, false);

	window.addEventListener("mousemove", function(event) {
		if (!hasJoined) return;
		event.preventDefault();
		return touchMove(event, "mouse", 0);
	}, false);

	render();
}

game();
