attribute vec3 position;
attribute vec3 direction;
attribute float side;

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat4 modelMatrix;
uniform float cameraAspect;
uniform float thickness;

varying float vSide;
varying float vFog;

void main() {
	vec4 currentView = viewMatrix * modelMatrix * vec4(position, 1.0);
	vec4 currentProj = projectionMatrix * currentView;
	vec2 currentScreen = currentProj.xy / currentProj.w;
	currentScreen.x *= cameraAspect;

	vec4 directionProj = projectionMatrix * viewMatrix * modelMatrix * vec4(direction, 1.0);
	vec2 directionScreen = directionProj.xy / directionProj.w;
	directionScreen.x *= cameraAspect;

	vec2 dir = normalize(directionScreen - currentScreen);
	vec2 normal = vec2(-dir.y, dir.x);
	normal *= side * thickness;
	normal.x /= cameraAspect;

	currentProj.xy += normal;
	gl_Position = currentProj;

	vSide = side;
	vFog = max(1.0 + currentView.z / 20.0, 0.0);
}
