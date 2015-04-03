uniform vec3 color;
uniform float opacity;

varying vec2 vUV;

void main() {
	float r = length(vUV);
	float a = atan(vUV.y, -vUV.x);
	float p = 0.1 + exp(3.5 * (-3.14 + abs(a))) * 0.4;
	gl_FragColor = vec4(color, smoothstep(-p, 0.0, -r) * opacity);
	gl_FragColor.a *= opacity;
}
