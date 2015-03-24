function bezier(track, axis, t) {
	var T = 1 - t;
	return	track.p0[axis] * T * T * T +
			track.p1[axis] * T * T * t * 3 +
			track.p2[axis] * T * t * t * 3 +
			track.p3[axis] * t * t * t;
}

function bezier1(track, axis, t) {
	var T = 1 - t;
	return	(track.p1[axis] - track.p0[axis]) * T * T * 3 +
			(track.p2[axis] - track.p1[axis]) * T * t * 6 +
			(track.p3[axis] - track.p2[axis]) * t * t * 3;
}

function bezier2(track, axis, t) {
	var T = 1 - t;
	return	(track.p2[axis] - 2 * track.p1[axis] + track.p0[axis]) * T * 6 +
			(track.p3[axis] - 2 * track.p2[axis] + track.p1[axis]) * t * 6;
}

function generateTrackGeometry(gl) {
	var radius = 0.1;
	var segments = 8;

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
			var C = vec3.create();
			vec3.negate(C, c);
			var a = [bezier1(track, 0, t), bezier1(track, 1, t), bezier1(track, 2, t)];
			vec3.normalize(a, a);
			var d = [bezier2(track, 0, t), bezier2(track, 1, t), bezier2(track, 2, t)];
			vec3.cross(d, a, d);
			vec3.normalize(d, d);
			var n = vec3.create();
			vec3.scaleAndAdd(n, c, d, radius);
			var m = mat4.create();
			mat4.translate(m, m, c);
			mat4.rotate(m, m, Math.PI * 2 / segments, a);
			mat4.translate(m, m, C);

			if (i === 0 || i === div)
				console.log(c, n);
			for (var s = 0; s < segments; ++s) {
				attributes.push(n[0], n[1], n[2], at);
				vec3.transformMat4(n, n, m);
			}
			if (i === 0 || i === div)
				console.log(c, n);

			if (i === 0) {
				vec3.scaleAndAdd(r0, c, a, -radius);
				// console.log(n);
			}
			if (i === div){
				vec3.scaleAndAdd(r1, c, a, radius);
				// console.log(n);
			}
		}

		attributes.push(r0[0], r0[1], r0[2], track.from);
		attributes.push(r1[0], r1[1], r1[2], track.to);

		for (var s = 0; s < segments; ++s) {
			for (var i = 0; i < div; ++i) {
				indexes.push(i * segments + s, i * segments + (s + 1) % segments, (i + 1) * segments + s);
				indexes.push((i + 1) * segments + s, i * segments + (s + 1) % segments, (i + 1) * segments + (s + 1) % segments);
			}

			indexes.push((div + 1) * segments, (s + 1) % segments, s);
			indexes.push((div + 1) * segments + 1, div * segments + s, div * segments + (s + 1) % segments);
		}

		var arrayBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, arrayBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(attributes), gl.STATIC_DRAW);

		var indexBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indexes), gl.STATIC_DRAW);

		track.attributes = arrayBuffer;
		track.indexes = indexBuffer;
		track.elements = 3 * segments * 2 * (track.resolution + 1);
	})
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
		return keyframes[a].co[1] * (1 - t) + keyframes[b].co[1] * (1 - t);
	
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
