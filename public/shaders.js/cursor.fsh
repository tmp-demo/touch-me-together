varying vec2 vUV;

void main() {
	float r = length(vUV);
	gl_FragColor = mix(
		vec4(1.0, 0.47, 0.03, 0.8),
		vec4(1.0, 0.39, 0.39, 0.5 - 1.0 * r),
		step(0.1, r)
	);
}
