attribute vec2 position;

varying vec2 vUV;

void main() {
	gl_Position = vec4(position * 2.0, 0.0, 1.0);
	vUV = position;
}
