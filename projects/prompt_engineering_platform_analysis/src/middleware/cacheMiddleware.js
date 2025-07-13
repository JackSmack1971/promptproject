const cacheMiddleware = (req, res, next) => {
  const { redisClient } = req;
  const key = req.originalUrl;
  const EXPIRE_TIME = 3600; // Cache for 1 hour

  if (!redisClient) {
    console.warn('Redis client not available, skipping cache for:', key);
    return next();
  }

  redisClient.get(key)
    .then(data => {
      if (data) {
        console.log('Cache hit for:', key);
        return res.json(JSON.parse(data));
      }
      console.log('Cache miss for:', key);
      // If no data in cache, proceed to route handler
      const originalSend = res.send;
      res.send = (body) => {
        redisClient.setEx(key, EXPIRE_TIME, body)
          .then(() => console.log('Cache set for:', key))
          .catch(err => console.error('Error setting cache for:', key, err));
        originalSend.call(res, body);
      };
      next();
    })
    .catch(err => {
      console.error('Redis GET error for key:', key, err);
      next(); // Proceed without caching on error
    });
};

module.exports = cacheMiddleware;