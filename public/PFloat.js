/**
 * @constructor
 * @param value
 * @param update
 * @param rate higher -> faster
 */
function PFloat(value, update, rate) {
	this.set(value);
	this.update = update;
	this.rate = rate;
}

/**
 * @param value
 */
PFloat.prototype.set = function(value) {
	this.current = this.target = value;
};

/**
 * @this {PFloat}
 */
PFloat.LINEAR = function(dt) {
	var dv = dt * this.rate;
	if (this.current <= this.target && this.current + dv >= this.target || this.current >= this.target && this.current - dv <= this.target) {
		this.current = this.target;
		return true;
	} else if (this.target > this.current)
		this.current += dv;
	else
		this.current -= dv;
	return false;
};

/**
 * @this {PFloat}
 */
PFloat.EXP = function(dt) {
	this.current += (this.target - this.current) * (1 - Math.exp(- dt * this.rate));
};
