
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

function game(isMaster) {
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
	
	generateTrackGeometry(gl);
	
	var programs = createPrograms(gl, {
		white: ['map', 'white'],
		bg: ['fullscreen', 'bg'],
		touch: ['billboard', 'touch'],
	});
	
	var cameraViewMatrix = mat4.create();
	var cameraProjectionMatrix = mat4.create();
	var cameraProjectionViewMatrix = mat4.create();
	var cameraAspect;
	var cameraFovy = 1.2;
	var cameraPosition;

	var touchScale;

	function updateCameraProjectionMatrix() {
		mat4.perspective(cameraProjectionMatrix, cameraFovy, cameraAspect, 1, 2000);
	}

	function onWindowResize(event) {
		var width = window.innerWidth;
		var height = window.innerHeight;
		cameraAspect = width / height;
		
		canvas.width = width;
		canvas.height = height;
		
		gl.viewport(0, 0, width, height);

		var touchRatio = 0.4;
		if (width > height)
			touchScale = [touchRatio / cameraAspect, touchRatio];
		else
			touchScale = [touchRatio, touchRatio * cameraAspect];

		return updateCameraProjectionMatrix();
	}
	
	window.addEventListener('resize', onWindowResize);
	onWindowResize();
	
	var inverseProjectionViewMatrix = new Float32Array(16);
	var mouse = vec2.create();
	function unprojectMouse(event) {
		var vec = vec4.fromValues(
			( (event.clientX - left) / width ) * 2 - 1,
			- ( (event.clientY - top) / height ) * 2 + 1,
			0,
			1
		);
		
		vec4.transformMat4(vec, vec, inverseProjectionViewMatrix);
		vec3.scale(vec, vec, 1 / vec[3]);
		
		vec3.subtract(vec, vec, cameraPosition);
		
		var distance = - cameraPosition[2] / vec[2];
		
		vec2.scaleAndAdd(mouse, cameraPosition, vec, distance);
	};
	
	var pingTime, serverHalfPing;
	var pingTimeout;
	
	function sendPing() {
		pingTime = Date.now();
		send(['ping']);
	}
	
	var sock = new SockJS('/ws');
	
	function send(args) {
		return sock.send(JSON.stringify(args));
	}
	
	sock.onopen = function() {
		sendPing();
	};
	
	sock.onmessage = function(e) {
		try {
			var message = JSON.parse(e.data);
		} catch (err) {
			console.warn(e.data);
			return console.error(err);
		}
		
		if (message[0] !== 'pong' && message[0] !== 'y')
			console.log(message);
		
		switch (message[0]) {
			case 'pong':
				serverHalfPing = (Date.now() - pingTime) / 2000;
				pingTimeout = setTimeout(sendPing, 200);
				break;
				
			default:
				console.log('unknown', message);
				break;
		}
	};
	
	sock.onclose = function() {
		clearTimeout(pingTimeout);
		pingTimeout = null;
	};
	
	gl.enable(gl.BLEND);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
	
	var startTime = Date.now();
	var lastTime = 0;
	var time;
	var dt;
	
	var musicalTime = 0;

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

		musicalTime += dt;
		while (musicalTime >= 20)
			musicalTime -= 20;
		
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
		
		gl.bindBuffer(gl.ARRAY_BUFFER, geometries.quad.array);
		
		gl.useProgram(programs.bg.id);
		gl.enableVertexAttribArray(programs.bg.position);
		gl.vertexAttribPointer(programs.bg.position, 2, gl.FLOAT, false, 0, 0);

		gl.uniform3fv(programs.bg.cameraPosition, cameraPosition);
		gl.uniformMatrix4fv(programs.bg.viewMatrix, false, cameraViewMatrix);
		gl.uniformMatrix4fv(programs.bg.inverseProjectionViewMatrix, false, inverseProjectionViewMatrix);
		
		gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

		gl.enable(gl.DEPTH_TEST);
		gl.depthMask(true);

		gl.useProgram(programs.white.id);
		gl.uniformMatrix4fv(programs.white.projectionViewMatrix, false, cameraProjectionViewMatrix);
		var worldMatrix = mat4.create();
		gl.uniformMatrix4fv(programs.white.worldMatrix, false, worldMatrix);
		gl.uniform1f(programs.white.currentTime, musicalTime);
		
		song.tracks.forEach(function(track) {
			gl.bindBuffer(gl.ARRAY_BUFFER, track.attributes);
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, track.indexes);
			gl.enableVertexAttribArray(programs.white.position);
			gl.vertexAttribPointer(programs.white.position, 3, gl.FLOAT, false, Float32Array.BYTES_PER_ELEMENT * 4, 0);
			gl.enableVertexAttribArray(programs.white.time);
			gl.vertexAttribPointer(programs.white.time, 1, gl.FLOAT, false, Float32Array.BYTES_PER_ELEMENT * 4, Float32Array.BYTES_PER_ELEMENT * 3);
			gl.drawElements(gl.TRIANGLES, track.elements, gl.UNSIGNED_SHORT, 0);
			// gl.drawArrays(gl.LINE_STRIP, 0, (track.resolution + 1)*8+2);
		})

		gl.disable(gl.DEPTH_TEST);
		gl.depthMask(false);
		
		gl.bindBuffer(gl.ARRAY_BUFFER, geometries.quad.array);
		
		gl.useProgram(programs.touch.id);
		gl.enableVertexAttribArray(programs.touch.position);
		gl.vertexAttribPointer(programs.touch.position, 2, gl.FLOAT, false, 0, 0);

		gl.uniformMatrix4fv(programs.touch.projectionViewMatrix, false, cameraProjectionViewMatrix);
		gl.uniform2fv(programs.touch.scale, touchScale);

		song.notes.forEach(function(note) {
			gl.uniform3fv(programs.touch.center, note.position);

			gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);

		})
	}
	
	render();
}

// var color = document.getElementById("color");
// color.addEventListener("touchstart", function(event) {
// 	color.style.background = "green";
// }, false);
// color.addEventListener("touchend", function(event) {
// 	color.style.background = "red";
// }, false);
// color.addEventListener("touchmove", function(event) {
// }, false);