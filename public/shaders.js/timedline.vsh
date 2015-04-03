attribute vec3 position;
attribute vec3 direction;
attribute float side;
attribute float time;

uniform mat4 projectionViewMatrix;
uniform mat4 modelMatrix;
uniform float cameraAspect;
uniform float currentTime;
uniform float beat;
uniform float thickness;

varying float vTime;
varying float vSide;

void main() {
	vec4 currentProj = projectionViewMatrix * modelMatrix * vec4(position, 1.0);
	vec2 currentScreen = currentProj.xy / currentProj.w;
	currentScreen.x *= cameraAspect;

	vec4 directionProj = projectionViewMatrix * vec4(direction, 1.0);
	vec2 directionScreen = directionProj.xy / directionProj.w;
	directionScreen.x *= cameraAspect;

	vec2 dir = normalize(directionScreen - currentScreen);
	vec2 normal = vec2(-dir.y, dir.x);
	normal *= side * thickness;
	normal.x /= cameraAspect;

	currentProj.xy += normal;
	gl_Position = currentProj;

	vTime = time;
	vSide = side;
}
