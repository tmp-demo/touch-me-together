attribute vec3 position;
attribute vec3 direction;
attribute float halfThickness;
attribute float time;

uniform mat4 projectionViewMatrix;
uniform float cameraAspect;
uniform float currentTime;

varying float vTime;

void main() {
	float fTime = fract(currentTime);
	float beat = 1.0 + fTime * (fTime - 1.0) * 2.0;

	vec4 currentProj = projectionViewMatrix * vec4(position, 1.0);
	vec2 currentScreen = currentProj.xy / currentProj.w;
	currentScreen.x *= cameraAspect;

	vec4 directionProj = projectionViewMatrix * vec4(direction, 1.0);
	vec2 directionScreen = directionProj.xy / directionProj.w;
	directionScreen.x *= cameraAspect;

	vec2 dir = normalize(directionScreen - currentScreen);
	vec2 normal = vec2(-dir.y, dir.x);
	normal *= halfThickness * beat;
	normal.x /= cameraAspect;

	currentProj.xy += normal;
	gl_Position = currentProj;

	vTime = time;
}
