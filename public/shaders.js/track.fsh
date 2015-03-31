uniform float currentTime;

varying float vTime;
varying float vSide;

void main() {
	float r = abs(vSide);
	float t = smoothstep(currentTime - 0.05, currentTime + 0.05, vTime);
	gl_FragColor = mix(
		mix(
			vec4(1.0, 0.47, 0.03, 0.8),
			vec4(1.0, 0.39, 0.39, 0.2 - 0.2 * r),
			smoothstep(0.1, 0.15, r)
		),
		mix(
			vec4(1.0, 1.0, 1.0, 0.8),
			vec4(0.8, 0.8, 1.0, 0.2 - 0.2 * r),
			smoothstep(0.1, 0.15, r)
		),
		t
	);
}
