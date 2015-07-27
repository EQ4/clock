
(function(window) {
	if (!window.console || !window.console.log) { return; }

	console.log('Clock');
	console.log('http://github.com/soundio/clock');
	console.log('Map beats against time and schedule fn calls');
	console.log('––––––––––––––––––––––––––––––––––––––––––––');
})(this);


(function(window) {
	"use strict";

	var AudioObject = window.AudioObject;
	var Collection  = window.Collection;
	var assign      = Object.assign;

	var lookahead = -60; // ms

	function isDefined(val) {
		return val !== undefined && val !== null;
	}

	function createCue(cues, time, fn, ms) {
		var data = [time, fn, setTimeout(function() {
			// Call the cued fn
			fn(time);

			// Remove timer from cues
			var i = cues.indexOf(data);
			cues.splice(i, 1);
		}, ms)];

		return data;
	}

	function cue(cues, currentTime, time, fn, lookahead) {
		// Cues up a function to fire at a time displaced by lookahead,
		// storing the time, fn and timer in cues.
		var diff = time - currentTime;
		var ms = Math.floor(diff * 1000) + lookahead;
		var data = createCue(cues, time, fn, ms);

		cues.push(data);
	}

	function uncueAll(cues) {
		var n = cues.length;

		while (n--) {
			clearTimeout(cues[n][2]);
		}

		cues.length = 0;
	}

	function uncue(cues, time, fn) {
		var n = cues.length;
		var data;

		if (typeof time === 'number') {
			while (n--) {
				data = cues[n];
				if (time === data[0]) {
					if (!fn || fn === data[1]) {
						cues.splice(n, 1);
						clearTimeout(data[2]);
					}
				}
			}
		}
		else {
			while (n--) {
				data = cues[n];
				if (fn === data[1]) {
					cues.splice(n, 1);
					clearTimeout(data[2]);
				}
			}
		}
	}

	function uncueLater(cues, time, fn) {
		var n = cues.length;
		var data;

		while (n--) {
			data = cues[n];
			if (time >= data[0]) {
				if (!fn || fn === data[1]) {
					cues.splice(n, 1);
					clearTimeout(data[2]);
				}
			}
		}
	}

	function recueAfterTime(cues, clock, time) {
		var n = clock.length;
		var data;
console.log(clock, n);
		while (--n) {
			data = cues[n];
			if (time < data[0]) {
				clearTimeout(data[2]);
				clock[n] = createCue(cues, data[0], data[1]);
			}
		}
	}

	function recueAfterBeat(cues, clock, beat) {
		recueAfterTime(cues, clock, clock.timeAtBeat(beat));
	}

	function tempoToRate(tempo) { return tempo / 60; }
	function rateToTempo(rate) { return rate * 60; }

	function deleteTimesAfterBeat(clock, beat) {
		var n = -1;
		var entry;

		while (clock[++n]) {
			entry = clock[n];
			if (entry.beat > beat) { delete clock[n].time; }
		}
	}

	function deleteTimesAfterEntry(clock, entry) {
		return deleteTimesAfterBeat(clock, entry.beat);
	}

	function setTimeOnEntry(clock, entry) {
		entry.time = clock.timeAtBeat(entry.beat);
	}

	function Clock(audio, data) {
		var oscillator = audio.createOscillator();
		var waveshaper = audio.createWaveShaper();
		var gain1 = audio.createGain();
		var gain2 = audio.createGain();
		var starttime = audio.currentTime;

		oscillator.type = 'square';
		oscillator.connect(waveshaper);
		waveshaper.shape = [1, 1, 1];
		gain1.gain.setValueAtTime(1, starttime);
		gain2.gain.setValueAtTime(1, starttime);
		oscillator.start();

		Collection.call(this, data || [], { index: 'beat' });
		AudioObject.call(this, audio, undefined, {
			unity:    waveshaper,
			rate:     gain1,
			duration: gain2,
		});

		var cues = [];

		Object.defineProperties(this, {
			startTime: { get: function() { return starttime; }},
			time: { get: function() { return audio.currentTime; }},
			beat: { get: function() { return this.beatAtTime(audio.currentTime); }}
		});

		this
		.on('add', deleteTimesAfterEntry)
		.on('add', setTimeOnEntry)
		.on('add', function(clock, entry) {
			clock.cue(entry.beat, function(time) {
				var rate = tempoToRate(entry.tempo);
				gain1.gain.setValueAtTime(rate,   time);
				gain2.gain.setValueAtTime(1/rate, time);
			});

			recueAfterBeat(cues, clock, entry.beat);
		});

		assign(this, {
			start: function(time) {
				deleteTimesAfterBeat(this, 0);
				starttime = isDefined(time) ? time : audio.currentTime ;
				//recueAfterBeat(cues, this, 0);
				this.trigger('start', starttime);
				return this;
			},

			create: function(tempo, beat) {
				var entry = {
					tempo: tempo,
					beat: isDefined(beat) ? beat : this.beat
				};

				this.remove(beat);
				this.add(entry);
				return entry;
			},

			on: function(beat, fn) {
				cue(cues, audio.currentTime, this.timeAtBeat(beat), fn, 0);
				return this;
			},

			cue: function(beat, fn, offset) {
				cue(cues, audio.currentTime, this.timeAtBeat(beat), fn, isDefined(offset) ? offset : lookahead);
				return this;
			},

			uncue: function(beat, fn) {
				if (arguments.length === 0) {
					uncueAll(cues);
					return this;
				}

				if (typeof beat === 'number') {
					uncue(cues, this.timeAtBeat(beat), fn);
				}
				else {
					uncue(cues, undefined, beat);
				}

				return this;
			},

			uncueAfter: function(beat, fn) {
				uncueLater(cues, this.timeAtBeat(beat), fn);
				return this;
			},

			onTime: function(time, fn) {
				// Make the cue timer 
				cue(cues, audio.currentTime, time, fn, 0);
				return this;
			},

			cueTime: function(time, fn, offset) {
				// Make the cue timer
				cue(cues, audio.currentTime, time, fn, isDefined(offset) ? offset : lookahead);
				return this;
			},

			uncueTime: function(time, fn) {
				if (typeof time === 'number') {
					uncue(cues, time, fn);
				}
				else {
					uncue(cues, undefined, time);
				}

				return this;
			},

			uncueAfterTime: function(time, fn) {
				uncueLater(cues, time, fn);
				return this;
			}
		});
	}

	assign(Clock.prototype, Collection.prototype, AudioObject.prototype, {
		timeAtBeat: function(beat) {
			// Sort tempos by beat
			this.sort();

			var tempos = this;
			var n = 0;
			var entry = tempos[n];

			if (!entry) {
				// Where there are no tempo entries, make time
				// equivalent to beat
				return this.startTime + beat;
			}

			var b1 = 0;
			var rate = 1;
			var time = 0;

			while (entry && entry.beat < beat) {
				time = entry.time || (entry.time = time + (entry.beat - b1) / rate);

				// Next entry
				b1 = entry.beat;
				rate = tempoToRate(entry.tempo);
				entry = tempos[++n];
			}

			return this.startTime + time + (beat - b1) / rate;
		},

		beatAtTime: function(time) {
			// Sort tempos by beat
			this.sort();

			var tempos = this;
			var n = 0;
			var entry = tempos[n];

			if (!entry) {
				// Where there are no tempo entries, make beat
				// equivalent to time
				return time - this.startTime;
			}

			var beat = 0;
			var rate = 1;
			var t2 = this.startTime;
			var t1 = t2;

			while (t2 < time) {
				rate  = tempoToRate(entry.tempo);
				beat  = entry.beat;
				entry = tempos[++n];
				t1 = t2;

				if (!entry) { break; }

				t2 = tempos.timeAtBeat(entry.beat);
			}

			return beat + (time - t1) * rate;
		}
	});

	assign(Clock, {
		tempoToRate: tempoToRate,
		rateToTempo: rateToTempo
	});

	window.Clock = Clock;
})(window);
