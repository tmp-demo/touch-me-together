uniform vec3 color;
uniform vec3 aura;
uniform float opacity;

varying vec2 vUV;

void main() {
	float r = length(vUV);
	gl_FragColor = mix(
		vec4(aura, max(0.5 - 2.0 * r, 0.0) + max(0.2 - abs(r - 0.31), 0.0)),
		vec4(color, 1.0),
		(1.0 - step(0.1, r) + step(0.3, r) - step(0.32, r)) * 0.8
	);
	gl_FragColor.a *= opacity;
}
