
varying vec2 vUV;

void main() {
	gl_FragColor = vec4(0.5, 0.7, 0.8, 1.0 - smoothstep(0.45, 0.5, length(vUV)));
}
