function bezier(track, axis, t) {
	var T = 1 - t;
	return	track.p0[axis] * T * T * T +
			track.p1[axis] * T * T * t * 3 +
			track.p2[axis] * T * t * t * 3 +
			track.p3[axis] * t * t * t;
}

function bezierLine(track, axis, t) {
	var T = 1 - t;
	return	track.p0[axis] * T +
			track.p3[axis] * t;
}

function bezier1(track, axis, t) {
	var T = 1 - t;
	return	(track.p1[axis] - track.p0[axis]) * T * T * 3 +
			(track.p2[axis] - track.p1[axis]) * T * t * 6 +
			(track.p3[axis] - track.p2[axis]) * t * t * 3;
}

function generateGeometry(gl) {
	song.tracks.forEach(function(track) {
		var attributes = [];
		var indexes = [];

		var r0 = vec3.create();
		var r1 = vec3.create();

		var div = track.resolution;
		for (var i = 0; i <= div; ++i) {
			var t = i / div;
			var at = track.from + (track.to - track.from) * t;
			var c = [bezier(track, 0, t), bezier(track, 1, t), bezier(track, 2, t)];
			var a = [bezier1(track, 0, t), bezier1(track, 1, t), bezier1(track, 2, t)];
			vec3.normalize(a, a);
			vec3.add(a, a, c);

			for (var s = 0; s < 2; ++s) {
				attributes.push(c[0], c[1], c[2], a[0], a[1], a[2], s === 0 ? 1 : -1, at);
			}
		}

		var arrayBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, arrayBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(attributes), gl.STATIC_DRAW);

		track.attributes = arrayBuffer;
		track.vertexCount = 2 * (div + 1);
	});

	song.notes.forEach(function(note) {
		if (note.segments) {
			note.segments.forEach(function(segment) {
				var attributes = [];
				var indexes = [];

				var r0 = vec3.create();
				var r1 = vec3.create();

				var div = segment.resolution;
				for (var i = 0; i <= div; ++i) {
					var t = i / div;
					var at = segment.from + (segment.to - segment.from) * t;
					var c = [bezier(segment, 0, t), bezier(segment, 1, t), bezier(segment, 2, t)];
					var a = [bezier1(segment, 0, t), bezier1(segment, 1, t), bezier1(segment, 2, t)];
					vec3.normalize(a, a);
					vec3.add(a, a, c);

					for (var s = 0; s < 2; ++s) {
						attributes.push(c[0], c[1], c[2], a[0], a[1], a[2], s === 0 ? 1 : -1, at);
					}
				}

				var arrayBuffer = gl.createBuffer();
				gl.bindBuffer(gl.ARRAY_BUFFER, arrayBuffer);
				gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(attributes), gl.STATIC_DRAW);

				segment.attributes = arrayBuffer;
				segment.vertexCount = 2 * (div + 1);
			});
		}
	});
}

function evalKeyframe(keyframes, time) {
	var a = 0, b = keyframes.length - 1;
	while (b - a > 1) {
		var c = Math.floor((a + b) / 2);
		if (keyframes[c].co[0] >= time)
			b = c;
		else
			a = c;
	}

	var t = (time - keyframes[a].co[0]) / (keyframes[b].co[0] - keyframes[a].co[0]);
	
	if (keyframes[a].inter === "LINEAR")
		return keyframes[a].co[1] * (1 - t) + keyframes[b].co[1] * t;
	
	var ta = 0, tb = 1;
	while (tb - ta > 0.0001) {
		var tc = (ta + tb) / 2;
		if (tc >= t)
			tb = tc;
		else
			ta = tc;
	}

	tc = (ta + tb) / 2;

	var TC = 1 - tc;
	return keyframes[a].co[1] * TC * TC * TC +
		keyframes[a].right[1] * TC * TC * tc * 3 +
		keyframes[b].left[1] * TC * tc * tc * 3 +
		keyframes[b].co[1] * tc * tc * tc;
}
