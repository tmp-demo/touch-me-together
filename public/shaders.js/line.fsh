uniform vec3 color;
uniform vec3 aura;
uniform float opacity;

varying float vSide;

void main() {
	float r = abs(vSide);
	gl_FragColor = mix(
		vec4(color, 0.8),
		vec4(aura, 0.2 - 0.2 * r),
		smoothstep(0.1, 0.15, r)
	);
	gl_FragColor.a *= opacity;
}
