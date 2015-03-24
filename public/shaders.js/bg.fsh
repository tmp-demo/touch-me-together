
uniform vec3 cameraPosition;
uniform mat4 inverseProjectionViewMatrix;

varying vec2 vUV;

vec3 hsv2rgb(vec3 c)
{
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float map(vec3 point) {
	vec3 m = mod(point, vec3(10.0)) - 5.0;
	return length(m) - 1.0;
}

void main() {
	vec4 center = inverseProjectionViewMatrix * vec4(vUV, 0, 1);
	vec3 dir = normalize(center.xyz / center.w - cameraPosition);
	
	float distance;
	vec3 point = cameraPosition;
	for (int i = 0; i < 64; ++i) {
		distance = map(point);
		point += distance * dir;
	}
	
	gl_FragColor = vec4(length(point) / 100.0);
}
