const { Pool } = require('pg');
const redisClient = require('../config/redis');

const pool = new Pool({
  user: 'your_db_user',
  host: 'localhost',
  database: 'prompt_engineering_db',
  password: 'your_db_password',
  port: 5432,
});

const EXPIRE_TIME = 3600; // Cache for 1 hour

module.exports = {
  query: async (text, params) => {
    const isReadQuery = text.toLowerCase().startsWith('select');
    const cacheKey = `db_query:${text}:${JSON.stringify(params)}`;

    if (isReadQuery) {
      try {
        const cachedData = await redisClient.get(cacheKey);
        if (cachedData) {
          console.log('DB Cache hit for:', cacheKey);
          return JSON.parse(cachedData);
        }
      } catch (err) {
        console.error('Redis GET error in db.js:', err);
      }
    }

    const result = await pool.query(text, params);

    if (isReadQuery && result.rows.length > 0) {
      try {
        await redisClient.setEx(cacheKey, EXPIRE_TIME, JSON.stringify(result));
        console.log('DB Cache set for:', cacheKey);
      } catch (err) {
        console.error('Redis SET error in db.js:', err);
      }
    } else if (!isReadQuery) {
      // Invalidate relevant caches on write operations
      // This is a simplified invalidation. A more robust solution would
      // involve specific cache keys for tables/resources.
      // For now, we'll clear all 'db_query' related caches.
      try {
        const keys = await redisClient.keys('db_query:*');
        if (keys.length > 0) {
          await redisClient.del(keys);
          console.log('Invalidated DB caches:', keys.length, 'keys');
        }
        // Also clear API response caches that might be affected by DB writes
        const apiKeys = await redisClient.keys('/api/*');
        if (apiKeys.length > 0) {
            await redisClient.del(apiKeys);
            console.log('Invalidated API caches:', apiKeys.length, 'keys');
        }
      } catch (err) {
        console.error('Redis cache invalidation error in db.js:', err);
      }
    }

    return result;
  },
};