attribute vec3 position;
attribute vec3 direction;
attribute float side;
attribute float time;

uniform mat4 projectionViewMatrix;
uniform float cameraAspect;
uniform float currentTime;
uniform float beat;

varying float vTime;
varying float vSide;

void main() {
	vec4 currentProj = projectionViewMatrix * vec4(position, 1.0);
	vec2 currentScreen = currentProj.xy / currentProj.w;
	currentScreen.x *= cameraAspect;

	vec4 directionProj = projectionViewMatrix * vec4(direction, 1.0);
	vec2 directionScreen = directionProj.xy / directionProj.w;
	directionScreen.x *= cameraAspect;

	vec2 dir = normalize(directionScreen - currentScreen);
	vec2 normal = vec2(-dir.y, dir.x);
	normal *= side * 0.1 * (1.0 + beat);
	normal.x /= cameraAspect;

	currentProj.xy += normal;
	gl_Position = currentProj;

	vTime = time;
	vSide = side;
}
