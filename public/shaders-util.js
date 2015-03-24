function createPrograms(gl, descs) {
	function compileShader(type, source, name) {
		var shader = gl.createShader(type);
		gl.shaderSource(shader, 'precision mediump float;\n' + source);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
			throw 'Compilation error ' + name + ': ' + gl.getShaderInfoLog(shader);
		return shader;
	}
	
	var shaders = {
		vertex: {},
		fragment: {}
	};
	
	for (var name in shaderSources.vertex)
		shaders.vertex[name] = compileShader(gl.VERTEX_SHADER, shaderSources.vertex[name], name);
	
	for (var name in shaderSources.fragment)
		shaders.fragment[name] = compileShader(gl.FRAGMENT_SHADER, shaderSources.fragment[name], name);
	
	function createProgram(vertexName, fragmentName) {
		var id = gl.createProgram();
		
		gl.attachShader(id, shaders.vertex[vertexName]);
		gl.attachShader(id, shaders.fragment[fragmentName]);
		
		gl.linkProgram(id);
		
		var linked = gl.getProgramParameter(id, gl.LINK_STATUS);
		if (!linked)
			throw 'Link error ' + vertexName + ' - ' + fragmentName + ': ' + gl.getProgramInfoLog(id);
		
		var program = {
			id: id
		};
		
		var na = gl.getProgramParameter(id, gl.ACTIVE_ATTRIBUTES);
		for (var i = 0; i < na; ++i) {
			var a = gl.getActiveAttrib(id, i);
			program[a.name] = gl.getAttribLocation(id, a.name);
			console.log("Attribute %s", a.name);
		}
		
		var nu = gl.getProgramParameter(id, gl.ACTIVE_UNIFORMS);
		for (var i = 0; i < nu; ++i) {
			var u = gl.getActiveUniform(id, i);
			program[u.name] = gl.getUniformLocation(id, u.name);
			console.log("Uniform %s", u.name);
		}
		
		return program;
	}

	var programs = {};

	for (var name in descs) {
		console.log("Compiling %s", name);
		programs[name] = createProgram.apply(null, descs[name]);
	}
	
	return programs;
}