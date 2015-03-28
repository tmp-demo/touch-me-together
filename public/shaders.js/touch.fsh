uniform vec3 color;
uniform float alpha;

varying vec2 vUV;

void main() {
	float r = length(vUV);
	gl_FragColor = vec4(color, (smoothstep(0.15, 0.2, r) - smoothstep(0.45, 0.5, r)) * alpha);
}
