var squaredDistanceMin = 0.01;

function HSVtoRGB(h, s, v) {
    var r, g, b, i, f, p, q, t;
    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return [r, g, b];
}

var points = [];

var tries = 0;
while (tries < 100) {
	var x = Math.random();
	var y = Math.random();
	if (!points.some(function(point) {
		var dx = (x - point.center[0] + 1.5) % 1 - 0.5;
		var dy = (y - point.center[1] + 1.5) % 1 - 0.5;
		return (dx * dx + dy * dy < squaredDistanceMin);
	})) {
		points.push({
			center: [x, y],
			color: HSVtoRGB(Math.random(), 0.5, 1)
		});
		tries = 0;
	} else
		++tries;
}

console.log("var trailPoints =", points, ";");
