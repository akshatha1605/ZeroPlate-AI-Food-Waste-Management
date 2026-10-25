process.env.NODE_ENV = "test";
process.env.DB_HOST = "mongodb://127.0.0.1:1/unused"; // never connected in tests
process.env.JWT_SECRET = "test-secret-test-secret-test-secret";
process.env.REDIS_ENABLED = "false";
