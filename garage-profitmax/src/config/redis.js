const Redis = require('ioredis');

// Fallback to a mock redis if connection fails to prevent app crash
let redisClient;

try {
  redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > 2) return null; // stop retrying
      return Math.min(times * 50, 2000);
    }
  });

  redisClient.on('error', (err) => {
    console.warn('Redis connection error:', err.message);
  });
} catch (e) {
  console.warn('Could not initialize Redis:', e.message);
}

module.exports = redisClient;
