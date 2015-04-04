attribute vec2 position;

uniform mat4 projectionViewMatrix;
uniform vec3 center;
uniform vec2 squareScale;
uniform float scale;

varying vec2 vUV;

void main() {
	vec4 screenPos = projectionViewMatrix * vec4(center, 1.0);
	gl_Position = vec4(screenPos.xy + position * squareScale * scale, screenPos.z, screenPos.w);
	vUV = position;
}
