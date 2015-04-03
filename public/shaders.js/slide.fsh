uniform float currentTime;
uniform float trailOpacity;
uniform vec3 center;
uniform vec3 outside;

varying float vTime;
varying float vSide;

void main() {
	float r = abs(vSide);
	float t = smoothstep(currentTime - 0.05, currentTime + 0.05, vTime);
	gl_FragColor = vec4(mix(center, outside, r), trailOpacity);
}
