# Data Schema — RailScout

No database is used in v1 — data flows: Extension → Backend → RailRadar API → Backend (processed) → Extension. Caching is in-memory only (not persisted).

## 1. Backend endpoint: `GET /api/find-confirmed`

### Request (query params)
| Param | Type | Required | Example |
|---|---|---|---|
| trainNumber | string | yes | "12952" |
| boardingStation | string | yes | "KOTA" |
| destination | string | yes | "NDLS" |
| date | string (YYYY-MM-DD) | yes | "2026-09-05" |
| classCode | string | yes | "3A" |
| quotaCode | string | no (default "GN") | "GN" |

### Response (success)
```json
{
  "success": true,
  "trainNumber": "12952",
  "trainName": "MUMBAI RAJDHANI",
  "boardingStation": "KOTA",
  "destination": "NDLS",
  "date": "2026-09-05",
  "classCode": "3A",
  "results": [
    {
      "stationCode": "RTM",
      "stationName": "Ratlam Jn",
      "distanceFromOrigin": 489,
      "stopsBeforeBoarding": 3,
      "availabilityStatus": "AVAILABLE-0012",
      "isConfirmed": true
    },
    {
      "stationCode": "KOTA",
      "stationName": "Kota Jn",
      "distanceFromOrigin": 712,
      "stopsBeforeBoarding": 0,
      "availabilityStatus": "GNWL24/WL11",
      "isConfirmed": false
    }
  ]
}
```

### Response (error)
```json
{
  "success": false,
  "error": {
    "code": "TRAIN_NOT_FOUND",
    "message": "Train 12952 not found on journey date 2026-09-05"
  }
}
```

Error codes to handle: `TRAIN_NOT_FOUND`, `STATION_NOT_ON_ROUTE`, `UPSTREAM_API_ERROR`, `RATE_LIMIT_EXCEEDED`, `INVALID_PARAMS`.

## 2. Internal: RailRadar route response (subset used)
From `GET /v1/trains/{number}` — used to build the ordered station list and find the boarding station's index.

## 3. Internal: RailRadar seats response (subset used)
From `GET /v1/trains/{number}/seats` — `availablityStatus` field is parsed into `isConfirmed` as follows:
- Starts with `"AVAILABLE"` → `isConfirmed: true`
- Starts with `"RAC"` → `isConfirmed: false` (but flagged separately as RAC, not full waitlist)
- Contains `"WL"` (e.g. `"GNWL24/WL11"`) → `isConfirmed: false`

## 4. Cache entry shape (in-memory)
```
key: `${trainNumber}_${date}_${classCode}_${quotaCode}`
value: { timestamp, results }
ttl: 5 minutes
```

## 5. Extension popup form state
```json
{
  "trainNumber": "",
  "boardingStation": "",
  "destination": "",
  "date": "",
  "classCode": "3A"
}
```
