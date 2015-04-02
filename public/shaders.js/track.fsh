uniform vec3 beforeColor;
uniform vec3 beforeAura;
uniform vec3 afterColor;
uniform vec3 afterAura;
uniform float currentTime;

varying float vTime;
varying float vSide;

void main() {
	float r = abs(vSide);
	float t = smoothstep(currentTime - 0.05, currentTime + 0.05, vTime);
	gl_FragColor = mix(
		mix(
			vec4(afterColor, 0.8),
			vec4(afterAura, 0.2 - 0.2 * r),
			smoothstep(0.1, 0.15, r)
		),
		mix(
			vec4(beforeColor, 0.8),
			vec4(beforeAura, 0.2 - 0.2 * r),
			smoothstep(0.1, 0.15, r)
		),
		t
	);
}
