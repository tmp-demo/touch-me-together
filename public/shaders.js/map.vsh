attribute vec3 position;
attribute float time;

uniform mat4 worldMatrix;
uniform mat4 projectionViewMatrix;

varying float vTime;

void main() {
	gl_Position = projectionViewMatrix * worldMatrix * vec4(position, 1.0);
	vTime = time;
}
