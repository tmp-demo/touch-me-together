uniform float currentTime;

varying float vTime;

void main() {
	float st = smoothstep(currentTime - 0.1, currentTime + 0.1, vTime);
	gl_FragColor = mix(
		vec4(0.0, 0.0, 1.0, 1.0),
		vec4(1.0, 0.0, 0.0, 1.0),
		st
	);
}
