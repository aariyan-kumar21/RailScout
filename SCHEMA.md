# Data Schema — RailScout

No database is used in v1 — data flows: Extension → Backend → RailRadar API → Backend (processed) → Extension. Caching is in-memory only (not persisted).

## 1. Primary Backend endpoint: `GET /api/find-dates` (Date-First)

### Request (query params)
| Param | Type | Required | Example | Description |
|---|---|---|---|---|
| trainNumber | string | yes | "12952" | 4 or 5 digit train number |
| boardingStation | string | yes | "KOTA" | IRCTC station code |
| destination | string | yes | "MMCT" | IRCTC station code |
| date | string (YYYY-MM-DD) | yes | "2026-10-16" | Desired journey date |
| classCode | string | yes | "3A" | Travel class (1A, 2A, 3A, SL, CC, 2S) |
| quotaCode | string | no (default "GN") | "GN" | Quota code |

### Response (success — confirmed on requested date)
```json
{
  "success": true,
  "trainNumber": "12952",
  "trainName": "New Delhi - Mumbai Central Tejas Rajdhani Express",
  "boardingStation": "KOTA",
  "destination": "MMCT",
  "date": "2026-10-15",
  "classCode": "3A",
  "requested": {
    "date": "2026-10-15",
    "weekday": "Thu",
    "status": "AVAILABLE-0009",
    "statusCode": "AVAILABLE",
    "isConfirmed": true,
    "availableSeats": 9,
    "waitlistNumber": null,
    "waitlistType": null
  },
  "nearest": null,
  "nearestBefore": null,
  "nearestAfter": null,
  "noConfirmedInWindow": false,
  "earlierStationOptions": null,
  "calendar": [
    {
      "date": "2026-10-15",
      "weekday": "Thu",
      "status": "AVAILABLE-0009",
      "statusCode": "AVAILABLE",
      "isConfirmed": true,
      "availableSeats": 9,
      "waitlistNumber": null,
      "waitlistType": null
    },
    {
      "date": "2026-10-16",
      "weekday": "Fri",
      "status": "RLWL4/WL4",
      "statusCode": "WAITLIST",
      "isConfirmed": false,
      "availableSeats": null,
      "waitlistNumber": 4,
      "waitlistType": "RLWL"
    }
  ]
}
```

### Response (success — not confirmed on requested date, nearest confirmed dates found)
```json
{
  "success": true,
  "trainNumber": "12952",
  "trainName": "New Delhi - Mumbai Central Tejas Rajdhani Express",
  "boardingStation": "KOTA",
  "destination": "MMCT",
  "date": "2026-10-16",
  "classCode": "3A",
  "requested": {
    "date": "2026-10-16",
    "weekday": "Fri",
    "status": "RLWL4/WL4",
    "statusCode": "WAITLIST",
    "isConfirmed": false,
    "availableSeats": null,
    "waitlistNumber": 4,
    "waitlistType": "RLWL"
  },
  "nearest": {
    "date": "2026-10-15",
    "weekday": "Thu",
    "status": "AVAILABLE-0009",
    "statusCode": "AVAILABLE",
    "isConfirmed": true,
    "availableSeats": 9,
    "waitlistNumber": null,
    "waitlistType": null,
    "daysFromRequested": -1
  },
  "nearestBefore": {
    "date": "2026-10-15",
    "weekday": "Thu",
    "status": "AVAILABLE-0009",
    "statusCode": "AVAILABLE",
    "isConfirmed": true,
    "availableSeats": 9,
    "waitlistNumber": null,
    "waitlistType": null,
    "daysFromRequested": -1
  },
  "nearestAfter": {
    "date": "2026-10-22",
    "weekday": "Thu",
    "status": "AVAILABLE-0012",
    "statusCode": "AVAILABLE",
    "isConfirmed": true,
    "availableSeats": 12,
    "waitlistNumber": null,
    "waitlistType": null,
    "daysFromRequested": 6
  },
  "noConfirmedInWindow": false,
  "earlierStationOptions": null,
  "calendar": [ ... ]
}
```

### Response (success — no confirmed seats at boarding station in window, fallback triggered)
```json
{
  "success": true,
  "trainNumber": "12952",
  "trainName": "New Delhi - Mumbai Central Tejas Rajdhani Express",
  "boardingStation": "KOTA",
  "destination": "MMCT",
  "date": "2026-10-17",
  "classCode": "3A",
  "requested": {
    "date": "2026-10-17",
    "weekday": "Sat",
    "status": "RLWL5/WL3",
    "statusCode": "WAITLIST",
    "isConfirmed": false,
    "availableSeats": null,
    "waitlistNumber": 3,
    "waitlistType": "RLWL"
  },
  "nearest": null,
  "nearestBefore": null,
  "nearestAfter": null,
  "noConfirmedInWindow": true,
  "earlierStationOptions": [
    {
      "stationCode": "NDLS",
      "stationName": "New Delhi",
      "date": "2026-10-17",
      "availableSeats": 14
    }
  ],
  "calendar": [ ... ]
}
```

### Response (error)
```json
{
  "success": false,
  "error": {
    "code": "DATE_OUT_OF_RANGE",
    "message": "Availability is only visible for roughly the next 14 days."
  }
}
```

Error codes: `DATE_OUT_OF_RANGE`, `TRAIN_NOT_FOUND`, `STATION_NOT_ON_ROUTE`, `WRONG_DIRECTION`, `INVALID_PARAMS`, `INVALID_DATE`, `INVALID_CLASS`, `SAME_STATIONS`, `RATE_LIMIT_EXCEEDED`, `UPSTREAM_API_ERROR`.

---

## 2. Station-Scanning Endpoint: `GET /api/find-confirmed`

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
      "isConfirmed": true,
      "availabilityType": "AVAILABLE",
      "availableSeats": 12,
      "waitlistNumber": null,
      "waitlistType": null
    },
    {
      "stationCode": "KOTA",
      "stationName": "Kota Jn",
      "distanceFromOrigin": 712,
      "stopsBeforeBoarding": 0,
      "availabilityStatus": "GNWL24/WL11",
      "isConfirmed": false,
      "availabilityType": "WAITLIST",
      "availableSeats": null,
      "waitlistNumber": 11,
      "waitlistType": "GNWL"
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

## 3. Internal: RailRadar route response (subset used)
From `GET /v1/trains/{number}` — used to build the ordered station list and find the boarding station's index.

## 4. Internal: RailRadar seats response (subset used)
From `GET /v1/trains/{number}/seats` — `calendar` array returned. `status` / `statusCode` / `isAvailable` fields are parsed:
- `isAvailable === true` (and not RAC) → `isConfirmed: true`
- Starts with `"RAC"` or statusCode `"RAC"` → `isConfirmed: false` (flagged as RAC)
- Contains `"WL"` (e.g. `"GNWL24/WL11"`, `"RLWL4/WL4"`) → `isConfirmed: false`

## 5. Cache entry shapes (in-memory)

### Date-First Calendar Cache (`GET /api/find-dates`)
Keyed by route, class, and quota (NOT by date):
```
key: `calendar_${trainNumber}_${boardingStation}_${destination}_${classCode}_${quotaCode}`
value: { timestamp, trainName, calendar }
ttl: 5 minutes
```

### Station Scan Cache (`GET /api/find-confirmed`)
Keyed by route, date, class, and quota:
```
key: `${trainNumber}_${boardingStation}_${destination}_${date}_${classCode}_${quotaCode}`
value: { timestamp, trainName, results }
ttl: 5 minutes
```

## 6. Frontend search form state
```json
{
  "trainNumber": "",
  "boardingStation": "",
  "destination": "",
  "date": "",
  "classCode": "3A",
  "quotaCode": "GN"
}
```
