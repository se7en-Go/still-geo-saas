class QueryProfiler {
  constructor(maxSamples = 100) {
    this.maxSamples = Math.max(1, Number(maxSamples) || 100);
    this.samples = [];
  }

  record(durationMs, metadata = {}) {
    this.samples.push({
      durationMs,
      metadata,
      recordedAt: new Date().toISOString(),
    });
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
  }

  getSummary() {
    if (this.samples.length === 0) {
      return {
        count: 0,
        averageMs: 0,
        p95Ms: 0,
        maxMs: 0,
        lastSample: null,
      };
    }

    const durations = this.samples.map((sample) => sample.durationMs).sort((a, b) => a - b);
    const average = durations.reduce((acc, value) => acc + value, 0) / durations.length;

    return {
      count: this.samples.length,
      averageMs: Number(average.toFixed(2)),
      p50Ms: this._percentile(durations, 0.5),
      p95Ms: this._percentile(durations, 0.95),
      maxMs: durations[durations.length - 1],
      lastSample: this.samples[this.samples.length - 1],
    };
  }

  getSamples() {
    return [...this.samples];
  }

  clear() {
    this.samples = [];
  }

  _percentile(sortedValues, percentile) {
    if (!sortedValues.length) {
      return 0;
    }
    if (percentile <= 0) {
      return sortedValues[0];
    }
    if (percentile >= 1) {
      return sortedValues[sortedValues.length - 1];
    }
    const index = Math.ceil(percentile * sortedValues.length) - 1;
    return sortedValues[Math.max(0, Math.min(sortedValues.length - 1, index))];
  }
}

module.exports = QueryProfiler;
