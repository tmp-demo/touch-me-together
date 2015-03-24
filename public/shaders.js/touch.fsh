
varying vec2 vUV;

void main() {
	float r = length(vUV);
	gl_FragColor = vec4(0.5, 0.7, 0.8, smoothstep(0.15, 0.2, r) - smoothstep(0.45, 0.5, r));
}
