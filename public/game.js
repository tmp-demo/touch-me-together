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
	
	var programs = createPrograms(gl, {
		bg: ['fullscreen', 'bg'],
		cursor: ['billboard', 'cursor'],
		slide: ['line', 'slide'],
		touch: ['billboard', 'touch'],
		track: ['line', 'track'],
		trail: ['billboard', 'trail'],
	});
	
	var cameraViewMatrix = mat4.create();
	var cameraProjectionMatrix = mat4.create();
	var cameraProjectionViewMatrix = mat4.create();
	var inverseProjectionViewMatrix = mat4.create();
	var cameraAspect;
	var cameraFov = 1.2;
	var cameraPosition;

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

	var currentChunk, nextChunk;
	var fadeConstant = 0.2;
	var currentStage = 0;

	function toMusicalTime(t) {
		return t / 60 * map.bpm;
	}

	function fromMusicalTime(t) {
		return t * 60 / map.bpm;
	}

	var touchLatency = fromMusicalTime(0.1);

	function pushNextSource() {
		var gainNode = audioCtx.createGain();
		var sourceNode = audioCtx.createBufferSource();
		sourceNode.buffer = audioBuffer;
		sourceNode.connect(gainNode);
		gainNode.connect(audioCtx.destination);

		var offset = fromMusicalTime(map.stages[currentStage].from)
		var duration = fromMusicalTime(map.stages[currentStage].to - map.stages[currentStage].from)
		var endTime = currentChunk.endTime + duration
		sourceNode.start(currentChunk.endTime, offset, duration);

		nextChunk = {
			gainNode: gainNode,
			sourceNode: sourceNode,
			endTime: endTime
		};
	}

	function discardNextSource() {
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
		if (isPlaying)
			send(['ping', Math.floor((audioCtx.currentTime - audioStartTime) * 1000 - serverHalfPing)]);
		else
			send(['ping']);
	}
	
	function connect() {
		socket = new eio.Socket();

		socket.on('open', function() {
			if (location.hash)
				send(['auth', location.hash.substr(1)]);
			sendPing();
		});
		
		socket.on('message', function(message) {
			try {
				message = JSON.parse(message);
			} catch (err) {
				console.warn(message);
				return console.error(err);
			}
			
			if (message[0] !== 'pong' && message[0] !== 'y')
				console.log(message);
			
			switch (message[0]) {
				case 'master':
					if (!isMaster) {
						isMaster = true;

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

								var gainNode = audioCtx.createGain();
								var sourceNode = audioCtx.createBufferSource();
								sourceNode.buffer = buffer;
								sourceNode.connect(gainNode);
								gainNode.connect(audioCtx.destination);

								var offset = fromMusicalTime(map.stages[0].from)
								var duration = fromMusicalTime(map.stages[0].to - map.stages[0].from)
								var endTime = audioStartTime + duration
								sourceNode.start(audioCtx.currentTime, offset, duration);

								currentChunk = {
									gainNode: gainNode,
									sourceNode: sourceNode,
									endTime: endTime
								};

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
					
				case 'pong':
					serverHalfPing = (Date.now() - pingTime) / 2000;
					pingTimeout = setTimeout(sendPing, 200);

					clientMusicalTime = masterMusicalTime;
					masterMusicalTime = toMusicalTime((message[1] - serverHalfPing) / 1000);
					clientRatio = 1;
					break;
					
				case 'rank':
					document.getElementById("rank").style.display = "block";
					document.getElementById("playerRank").innerHTML = message[1];
					document.getElementById("playerCount").innerHTML = message[2];
					break;
					
				case 'score':
					send(['score', score]);
					break;

				case 'stage':
					currentStage = message[1];
					break;

				case 'summary':
					document.getElementById("summary").style.display = "block";
					document.getElementById("summaryPlayerCount").innerHTML = message[1];
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
				var duration = map.stages[currentStage].to - map.stages[currentStage].from;
				musicalTime -= duration;
				audioStartTime += fromMusicalTime(duration);
				currentChunk = nextChunk;
				pushNextSource();
				resetNotes();
			}
		}
		else {
			var dmt = toMusicalTime(dt);
			var duration = map.stages[currentStage].to - map.stages[currentStage].from;

			masterMusicalTime += dmt;
			while (masterMusicalTime >= map.stages[currentStage].to) {
				masterMusicalTime -= duration;
				resetNotes();
			}

			clientMusicalTime += dmt;
			while (clientMusicalTime >= map.stages[currentStage].to) {
				clientMusicalTime -= duration;
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

		// console.log(beat);

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

		mat4.lookAtTilt(cameraViewMatrix, cameraPosition, [
			animate(song.animations.camTargetX),
			animate(song.animations.camTargetY),
			animate(song.animations.camTargetZ),
		], [0,0,1], -animate(song.animations.camTilt));

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
				var clipPosition = vec4.create();
				vec4.transformMat4(clipPosition, [note.position[0], note.position[1], note.position[2], 1], cameraProjectionViewMatrix);
				vec3.scale(clipPosition, clipPosition, 1 / clipPosition[3]);
				if (vec2.squaredDistance(clipPosition, fingerPosition) > 0.2)
				{
					note.inProgress = false;
					note.opacity.target = 0;
					note.trailOpacity.target = 0.2;
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
		gl.uniform1f(programs.trail.opacity, 0.8);
		gl.uniform1f(programs.trail.scale, 0.2);

		trailPoints.forEach(function(point) {
			var x = point.center[0];
			var y = point.center[1];
			x = 0.5 - (x + musicalTime / 8) % 1; 
			y -= 0.5;
			gl.uniform3fv(programs.trail.center, [x, y, 0]);
			gl.uniform3fv(programs.trail.color, point.color);

			gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
		});

		// SLIDES

		var size = Float32Array.BYTES_PER_ELEMENT * 8;

		gl.useProgram(programs.slide.id);
		gl.uniformMatrix4fv(programs.slide.projectionViewMatrix, false, cameraProjectionViewMatrix);
		gl.uniform1f(programs.slide.cameraAspect, cameraAspect);
		gl.uniform1f(programs.slide.currentTime, musicalTime);
		gl.uniform1f(programs.slide.beat, beat);
		gl.uniform1f(programs.slide.thickness, 0.2);
		gl.uniform3fv(programs.slide.center, touchAura);
		gl.uniform3fv(programs.slide.outside, touchColor);
		
		slides.forEach(function(slide) {
			gl.uniform1f(programs.slide.trailOpacity, slide.trailOpacity.current);
			slide.segments.forEach(function(segment) {
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
		gl.uniform1f(programs.track.cameraAspect, cameraAspect);
		gl.uniform1f(programs.track.currentTime, musicalTime);
		gl.uniform1f(programs.track.beat, beat);
		gl.uniform1f(programs.track.thickness, 0.1 * (1.0 + beat));
		gl.uniform3fv(programs.track.beforeColor, trackBeforeColor);
		gl.uniform3fv(programs.track.beforeAura, trackBeforeAura);
		gl.uniform3fv(programs.track.afterColor, trackAfterColor);
		gl.uniform3fv(programs.track.afterAura, trackAfterAura);
		
		song.tracks.forEach(function(track) {
			gl.bindBuffer(gl.ARRAY_BUFFER, track.attributes);
			gl.vertexAttribPointer(programs.track.position, 3, gl.FLOAT, false, size, 0);
			gl.vertexAttribPointer(programs.track.direction, 3, gl.FLOAT, false, size, Float32Array.BYTES_PER_ELEMENT * 3);
			gl.vertexAttribPointer(programs.track.side, 1, gl.FLOAT, false, size, Float32Array.BYTES_PER_ELEMENT * 6);
			gl.vertexAttribPointer(programs.track.time, 1, gl.FLOAT, false, size, Float32Array.BYTES_PER_ELEMENT * 7);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, track.vertexCount);
			// gl.drawArrays(gl.LINE_STRIP, 0, track.vertexCount);
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
			gl.uniform3fv(programs.touch.center, note.position);
			gl.uniform1f(programs.touch.opacity, note.opacity.current);
			gl.uniform1f(programs.touch.scale, note.scale.current * (3 + beat));

			gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
		});

		touches.forEach(function(note) {
			note.opacity.update(dt);
			note.scale.update(dt);

			gl.uniform3fv(programs.touch.center, note.position);
			gl.uniform1f(programs.touch.opacity, note.opacity.current);
			gl.uniform1f(programs.touch.scale, note.scale.current * (3 + beat));

			gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
		});

		// CURSORS

		gl.useProgram(programs.cursor.id);
		gl.vertexAttribPointer(programs.cursor.position, 2, gl.FLOAT, false, 0, 0);

		gl.uniformMatrix4fv(programs.cursor.projectionViewMatrix, false, cameraProjectionViewMatrix);
		gl.uniform2fv(programs.cursor.squareScale, squareScale);
		gl.uniform1f(programs.cursor.scale, 0.1 * (3 + beat));
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

	function addScore(inc) {
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

		var element = feedbackPool.pop();
		element.className = "feedback " + className;
		element.innerHTML = feedback;
		setTimeout(function() {
			element.className = "";
			element.innerHTML = "";
			feedbackPool.push(element);
		}, 3000);
	}

	var noteByIdentifiers = {};
	var fingerPositions = {};

	function updateFingerPosition(desc, identifier) {
		var width = window.innerWidth;
		var height = window.innerHeight;
		var fingerPosition = [desc.pageX / width * 2 - 1, desc.pageY / height * 2 - 1];
		if (width > height)
			fingerPosition[0] *= cameraAspect;
		else
			fingerPosition[1] /= cameraAspect;
		fingerPositions[identifier] = fingerPosition;
		return fingerPosition;
	}

	function touchStart(desc, identifier, latency) {
		var time = musicalTime - latency;

		song.notes.sort(function(a, b) {
			return Math.abs(a.time - time) - Math.abs(b.time - time);
		});

		var clipPosition = vec4.create();
		fingerPosition = updateFingerPosition(desc, identifier);

		for (var i = 0, n = song.notes.length; i < n; ++i) {
			var note = song.notes[i];
			if (note.scored)
				continue;

			var dt = Math.abs(note.time - time);
			if (dt > 0.5)
				break;

			vec4.transformMat4(clipPosition, [note.position[0], note.position[1], note.position[2], 1], cameraProjectionViewMatrix);
			vec3.scale(clipPosition, clipPosition, 1 / clipPosition[3]);
			//if (vec2.squaredDistance(clipPosition, fingerPosition) < 0.2)
			{
				note.scored = true;
				console.log(fromMusicalTime(note.time - time));

				if (note.segments) {
					note.inProgress = true;
					note.identifier = identifier;
					note.scale.target = 0.5;
					note.firstScore = 0.5 - dt;
					noteByIdentifiers[identifier] = note;
				} else {
					addScore(1 - dt * 2);
					note.opacity.target = 0;
					note.scale.target = 0.5;
				}

				break;
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

			var dt = Math.abs(note.segments[note.segments.length - 1].to - time);
			if (dt > 0.5) {
				note.trailOpacity.target = 0.2;
			} else {
				addScore(note.firstScore + 0.5 - dt);
				// note.scale.target = 1;
			}

			note.opacity.target = 0;
		}
	}

	window.addEventListener('keydown', function(event) {
		console.log();
		if (isPlaying) {
			// console.log(event.which);
			switch (event.which) {
				case 13: // enter
					if (document.activeElement.id !== "message")
						document.getElementById("message").focus();
					else
						document.activeElement.blur();
					break;

				case 37: // left
					if (document.activeElement.id !== "message") {
						currentStage = Math.max(currentStage - 1, 0);
						send(['stage', currentStage]);
					}
					break;

				case 39: // right
					if (document.activeElement.id !== "message") {
						discardNextSource();
						currentStage = Math.min(currentStage + 1, map.stages.length - 1);
						pushNextSource();
						send(['stage', currentStage]);
					}
					break;
			}
		}
	}, true);

	window.addEventListener("touchstart", function(event) {
		event.preventDefault();
		for (var i = 0, n = event.changedTouches.length; i < n; ++i) {
			var touch = event.changedTouches[i];
			touchStart(touch, touch.identifier, touchLatency);
		}
	}, false);

	window.addEventListener("touchend", function(event) {
		event.preventDefault();
		for (var i = 0, n = event.changedTouches.length; i < n; ++i) {
			var touch = event.changedTouches[i];
			touchEnd(touch, touch.identifier, touchLatency);
		}
	}, false);

	window.addEventListener("touchmove", function(event) {
		event.preventDefault();
		for (var i = 0, n = event.changedTouches.length; i < n; ++i) {
			var touch = event.changedTouches[i];
			touchMove(touch, touch.identifier, touchLatency);
		}
	}, false);

	window.addEventListener("mousedown", function(event) {
		event.preventDefault();
		return touchStart(event, "mouse", 0);
	}, false);

	window.addEventListener("mouseup", function(event) {
		event.preventDefault();
		return touchEnd(event, "mouse", 0);
	}, false);

	window.addEventListener("mousemove", function(event) {
		event.preventDefault();
		return touchMove(event, "mouse", 0);
	}, false);

	render();
}

game();
