# Hotel Orchestration Service

A hotel aggregation service that fetches offers from multiple suppliers, deduplicates them, and caches results using Redis. Built with Express, Temporal workflows, and Redis.

## Architecture

- **Express API**: REST endpoints for hotel search and health checks
- **Temporal Workflows**: Orchestrates parallel supplier calls with retry logic
- **Redis Cache**: Stores deduplicated results with 15-minute TTL
- **Supplier APIs**: Mock internal endpoints (Supplier A & B)

## Prerequisites

**Required External Services:**
- **Temporal Server** (running on `localhost:7233` or custom URL)
- **Redis Server** (running on `localhost:6379` or custom URL)


## Setup

### 1. Clone and Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file in the project root:

```env
PORT=3000
TEMPORAL_URL=localhost:7233
REDIS_URL=redis://localhost:6379
LOG_LEVEL=info
```

### 3. Run in Development Mode
```bash
npm run dev
```

The server will start on `http://localhost:3000`

## API Endpoints

### 1. Hotel Search
**GET** `/api/hotels`

Search for hotels by city with optional price filtering.

**Query Parameters:**
- `city` (optional, default: "delhi") - City name (lowercase)
- `minPrice` (optional) - Minimum price filter
- `maxPrice` (optional) - Maximum price filter

**Example Requests:**
```bash
# Search hotels in Delhi
curl "http://localhost:3000/api/hotels?city=delhi"

# Search with price range
curl "http://localhost:3000/api/hotels?city=mumbai&minPrice=5000&maxPrice=10000"

# Search in Bangalore
curl "http://localhost:3000/api/hotels?city=bangalore"
```

**Response:**
```json
[
  {
    "hotelId": "b1",
    "name": "Holtin",
    "price": 5340,
    "city": "delhi",
    "commissionPct": 20,
    "supplier": "supplierB"
  },
  {
    "hotelId": "a2",
    "name": "Radison",
    "price": 5900,
    "city": "delhi",
    "commissionPct": 13,
    "supplier": "supplierA"
  }
]
```

**Features:**
- First request triggers Temporal workflow to fetch from suppliers
- Results are cached in Redis for 15 minutes
- Subsequent requests return cached data instantly
- Deduplication: Same hotel from multiple suppliers shows lowest price

### 2. Health Check
**GET** `/health`

Check the health status of all dependencies.

**Example Request:**
```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-04-26T12:00:00.000Z",
  "dependencies": {
    "redis": {
      "status": "healthy",
      "message": "Connected and responsive"
    },
    "temporal": {
      "status": "healthy",
      "message": "Connected to Temporal server"
    },
    "worker": {
      "status": "healthy",
      "message": "Worker is running"
    },
    "supplierA": {
      "status": "healthy",
      "message": "Supplier A responding"
    },
    "supplierB": {
      "status": "healthy",
      "message": "Supplier B responding"
    }
  }
}
```

**Status Codes:**
- `200` - All dependencies healthy
- `503` - One or more dependencies unhealthy

### 3. Supplier Endpoints (Internal)
**GET** `/supplierA/hotels?city=delhi`
**GET** `/supplierB/hotels?city=mumbai`

Mock supplier endpoints with simulated latency (100-300ms).

## Docker Deployment

### Build Docker Image
```bash
docker build -t hotel-orc .
```

### Run Container
```bash
docker run -p 3000:3000 \
  -e TEMPORAL_URL=host.docker.internal:7233 \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  -e LOG_LEVEL=info \
  --add-host host.docker.internal:host-gateway \
  hotel-orc
```

**Note:** The container connects to Temporal and Redis running on your host machine via `host.docker.internal`.

### Run with Custom Port
```bash
docker run -p 8080:3000 \
  -e TEMPORAL_URL=host.docker.internal:7233 \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  --add-host host.docker.internal:host-gateway \
  hotel-orc
```

Access the API at `http://localhost:8080`

## Development

### Available Scripts

```bash
# Development mode with hot reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run Temporal worker separately (optional)
npm run worker
```

### Project Structure

```
hotel-orc/
├── src/
│   ├── index.ts              # Main Express app
│   ├── logger.ts             # Custom logger with log levels
│   ├── routes/
│   │   ├── health.ts         # Health check endpoint
│   │   └── hotels.ts         # Hotel search endpoint
│   ├── redis/
│   │   └── client.ts         # Redis client & caching logic
│   ├── suppliers/
│   │   ├── data.ts           # Mock hotel data
│   │   ├── supplierA.ts      # Supplier A endpoint
│   │   └── supplierB.ts      # Supplier B endpoint
│   └── temporal/
│       ├── activities.ts     # Temporal activities
│       ├── workflows.ts      # Temporal workflows
│       └── worker.ts         # Temporal worker setup
├── Dockerfile
├── package.json
├── tsconfig.json
└── .env
```

## How It Works

### Workflow Flow

1. **Client Request** → `/api/hotels?city=delhi`
2. **Check Redis Cache** → If cached, return immediately
3. **Cache Miss** → Start Temporal workflow
4. **Parallel Supplier Calls** → Fetch from Supplier A & B concurrently
5. **Deduplicate & Cache** → Store in Redis (15 min TTL)
6. **Return Results** → Filtered by price range if specified

### Deduplication Logic

- Hotels are deduplicated by **name**
- When same hotel exists in multiple suppliers, **lowest price wins**
- Redis sorted set ensures efficient price-based filtering
- Supplier information is preserved in the response

### Caching Strategy

- **Key Pattern**: `hotels:{city}:offers` (sorted set), `hotels:{city}:details` (hash)
- **TTL**: 15 minutes
- **Invalidation**: Automatic expiration
- **Price Filtering**: Done at Redis level using `ZRANGEBYSCORE`

## Testing

### Test with Postman

Import the `postman_collection.json` file into Postman to test all endpoints.

### Manual Testing

```bash
# Test health check
curl http://localhost:3000/health

# Test hotel search (first call - triggers workflow)
curl "http://localhost:3000/api/hotels?city=delhi"

# Test cached response (second call - instant)
curl "http://localhost:3000/api/hotels?city=delhi"

# Test price filtering
curl "http://localhost:3000/api/hotels?city=delhi&minPrice=6000&maxPrice=9000"

# Test different city
curl "http://localhost:3000/api/hotels?city=mumbai"

# Test city with no results
curl "http://localhost:3000/api/hotels?city=paris"
```

## Troubleshooting

### Temporal Connection Failed
```
Error: Temporal connection failed
```
**Solution:** Ensure Temporal server is running on `localhost:7233`
```bash
temporal server start-dev
```

### Redis Connection Failed
```
Error: Redis client not connected
```
**Solution:** Ensure Redis server is running on `localhost:6379`
```bash
redis-server
```

### Worker Not Starting
```
Error: Worker not initialized
```
**Solution:** Check Temporal worker logs and ensure workflows are built
```bash
npm run build
```

### Docker Container Exits Immediately
**Solution:** Check logs for errors
```bash
docker logs <container-id>
```

Ensure Temporal and Redis are accessible from the container via `host.docker.internal`.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `TEMPORAL_URL` | Temporal server address | `localhost:7233` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | `info` |

## Available Cities

The mock data includes hotels in:
- `delhi`
- `mumbai`
- `bangalore`

## License

ISC
