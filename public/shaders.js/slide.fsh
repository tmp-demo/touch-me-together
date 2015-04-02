uniform float currentTime;
uniform float trailOpacity;

varying float vTime;
varying float vSide;

void main() {
	float r = abs(vSide);
	float t = smoothstep(currentTime - 0.05, currentTime + 0.05, vTime);
	gl_FragColor = vec4(1.0, 1.0, 1.0, trailOpacity);
}
