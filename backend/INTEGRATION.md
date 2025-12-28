# Frontend Integration Guide

This guide shows how to integrate the backend API with your frontend application.

## Setup

### 1. Start the Backend Server

```bash
cd backend
npm run dev
```

The API will be available at `http://localhost:3001`

### 2. Configure Frontend

Add the API base URL to your frontend environment configuration.

## Frontend Integration Examples

### React/TypeScript Example

Create an API client:

```typescript
// src/lib/api-client.ts
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export interface Installation {
  id: string;
  deviceId: string;
  locationId: string;
  status: 'pending' | 'verified' | 'flagged';
  sensorReading: number;
  latitude?: number;
  longitude?: number;
  imageUrls: string[];
  videoUrl?: string;
  installedBy: string;
  installedByName: string;
  teamId?: string;
  createdAt: string;
  updatedAt: string;
  verifiedAt?: string;
  // ... other fields
}

export interface InstallationsResponse {
  success: boolean;
  data: Installation[];
  metadata: {
    total: number;
    returned: number;
    offset: number;
    limit: number | null;
    timestamp: string;
  };
}

export interface InstallationStats {
  total: number;
  byStatus: {
    pending: number;
    verified: number;
    flagged: number;
  };
  systemPreVerified: number;
  withImages: number;
  withVideo: number;
  byTeam: Record<string, number>;
  timestamp: string;
}

// Fetch all installations with optional filters
export async function fetchInstallations(params?: {
  teamId?: string;
  status?: string;
  deviceId?: string;
  locationId?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}): Promise<InstallationsResponse> {
  const url = new URL(`${API_BASE_URL}/api/installations`);
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Failed to fetch installations: ${response.statusText}`);
  }
  
  return response.json();
}

// Fetch single installation
export async function fetchInstallation(id: string): Promise<Installation> {
  const response = await fetch(`${API_BASE_URL}/api/installations/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch installation: ${response.statusText}`);
  }
  
  const result = await response.json();
  return result.data;
}

// Fetch statistics
export async function fetchInstallationStats(): Promise<InstallationStats> {
  const response = await fetch(`${API_BASE_URL}/api/installations/stats/summary`);
  if (!response.ok) {
    throw new Error(`Failed to fetch stats: ${response.statusText}`);
  }
  
  const result = await response.json();
  return result.data;
}

// Export installations
export async function exportInstallations(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/installations/export/json`);
  if (!response.ok) {
    throw new Error(`Failed to export installations: ${response.statusText}`);
  }
  
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `installations_${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
```

### Using the API Client

```typescript
// In your React component
import { useEffect, useState } from 'react';
import { fetchInstallations, fetchInstallationStats, type Installation } from '@/lib/api-client';

export function InstallationsExternalView() {
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const response = await fetchInstallations({
          status: 'verified',
          limit: 50
        });
        setInstallations(response.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <h1>Installations ({installations.length})</h1>
      {installations.map(inst => (
        <div key={inst.id}>
          <p>Device: {inst.deviceId}</p>
          <p>Location: {inst.locationId}</p>
          <p>Status: {inst.status}</p>
        </div>
      ))}
    </div>
  );
}
```

### Pagination Example

```typescript
function InstallationsList() {
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data, metadata } = await fetchInstallations({
    limit: pageSize,
    offset: page * pageSize
  });

  return (
    <div>
      {/* Display data */}
      
      <div className="pagination">
        <button 
          disabled={page === 0}
          onClick={() => setPage(p => p - 1)}
        >
          Previous
        </button>
        
        <span>
          Page {page + 1} of {Math.ceil(metadata.total / pageSize)}
        </span>
        
        <button 
          disabled={(page + 1) * pageSize >= metadata.total}
          onClick={() => setPage(p => p + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

### Statistics Dashboard

```typescript
function StatsDashboard() {
  const [stats, setStats] = useState<InstallationStats | null>(null);

  useEffect(() => {
    fetchInstallationStats().then(setStats);
  }, []);

  if (!stats) return <div>Loading stats...</div>;

  return (
    <div className="stats-grid">
      <div className="stat-card">
        <h3>Total Installations</h3>
        <p>{stats.total}</p>
      </div>
      
      <div className="stat-card">
        <h3>Verified</h3>
        <p>{stats.byStatus.verified}</p>
      </div>
      
      <div className="stat-card">
        <h3>Pending</h3>
        <p>{stats.byStatus.pending}</p>
      </div>
      
      <div className="stat-card">
        <h3>Flagged</h3>
        <p>{stats.byStatus.flagged}</p>
      </div>
    </div>
  );
}
```

## Environment Variables

Add to your frontend `.env` file:

```env
VITE_API_URL=http://localhost:3001
```

For production:
```env
VITE_API_URL=https://your-backend-domain.com
```

## External Applications

### Mobile App Integration

```javascript
// React Native / Expo example
async function getInstallations() {
  try {
    const response = await fetch('http://localhost:3001/api/installations');
    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error('Error fetching installations:', error);
    throw error;
  }
}
```

### Python Integration

```python
import requests
import pandas as pd

# Fetch all installations
response = requests.get('http://localhost:3001/api/installations')
data = response.json()

# Convert to DataFrame for analysis
installations = pd.DataFrame(data['data'])

# Filter by team
team_installations = installations[installations['teamId'] == 'team123']

# Export to CSV
installations.to_csv('installations.csv', index=False)
```

### Excel/Power BI Integration

Use Power Query to fetch data from the API:

```powerquery
let
    Source = Json.Document(Web.Contents("http://localhost:3001/api/installations")),
    Data = Source[data],
    ConvertedToTable = Table.FromList(Data, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
    ExpandedRecords = Table.ExpandRecordColumn(ConvertedToTable, "Column1", 
        {"id", "deviceId", "locationId", "status", "createdAt"})
in
    ExpandedRecords
```

## Best Practices

1. **Error Handling**: Always wrap API calls in try-catch blocks
2. **Loading States**: Show loading indicators while fetching data
3. **Caching**: Consider using React Query or SWR for data caching
4. **Pagination**: Use pagination for large datasets
5. **Filtering**: Apply filters server-side for better performance
6. **Security**: Never expose sensitive credentials in frontend code

## Troubleshooting

### CORS Errors

If you get CORS errors, ensure:
1. Backend is running
2. Frontend URL is added to `ALLOWED_ORIGINS` in backend `.env`
3. Browser cache is cleared

### Connection Refused

- Check if backend server is running
- Verify the API URL is correct
- Check firewall settings

### Empty Response

- Verify Firebase credentials are configured
- Check if installations collection has data
- Review server logs for errors

