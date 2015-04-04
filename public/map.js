var map = {
	bpm: 140,
	end: 320,
	stages: [
        /* wait for connection */
		{
			from: 0,
			to: 2,
		},
		{
			from: 2,
			to: 10,
			loop: true,
		},
		{
			from: 10,
			to: 15,
		},
        /* tutorial */
		{
			from: 15,
			to: 47,
			loop: true,
		},
        /* transition */
		{
			from: 47,
			to: 80,
		},
        /* scoring start */
		{
			from: 80,
			to: 112,
			score: true,
		},
        /* riff 1 - first */
		{
			from: 112,
			to: 144,
			score: true,
		},
        /* organ - first */
		{
			from: 144,
			to: 176,
			score: true,
		},
        /* riff 1 - second */
		{
			from: 176,
			to: 208,
			score: true,
		},
        /* organ - second */
		{
			from: 208,
			to: 240,
			score: true,
		},
        /* riff 2 */
		{
			from: 240,
			to: 304,
			score: true,
		},
        /* end */
		{
			from: 304,
			to: 320,
		},
		{
			from: 320,
			to: 336,
			loop: true,
		},
	]
};