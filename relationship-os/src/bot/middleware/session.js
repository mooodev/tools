const Redis = require('ioredis');

function redisSession() {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  return async (ctx, next) => {
    const key = `session:${ctx.from?.id}`;

    // Load session
    const raw = await redis.get(key);
    ctx.session = raw ? JSON.parse(raw) : {};
    ctx.session._redis = redis;

    await next();

    // Save session (exclude internal ref)
    const { _redis, ...data } = ctx.session;
    await redis.setex(key, 86400, JSON.stringify(data)); // TTL 24h
  };
}

module.exports = { redisSession };
