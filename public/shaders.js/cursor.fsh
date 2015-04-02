uniform vec3 color;
uniform vec3 aura;

varying vec2 vUV;

void main() {
	float r = length(vUV);
	gl_FragColor = mix(
		vec4(color, 0.8),
		vec4(aura, 0.5 - 1.0 * r),
		step(0.1, r)
	);
}
