declare module "@mapbox/mapbox-sdk/services/geocoding" {
  interface GeocodingResponse {
    body: any;
  }

  interface GeocodingRequest {
    send: () => Promise<GeocodingResponse>;
  }

  export interface GeocodingService {
    forwardGeocode(options: {
      query: string;
      limit?: number;
      language?: string[];
      countries?: string[];   // ✅ add this line
    }): GeocodingRequest;

    reverseGeocode(options: {
      query: [number, number];
      limit?: number;
      language?: string[];
      countries?: string[];   // ✅ also valid for reverse
    }): GeocodingRequest;
  }

  export default function geocodingService(config: {
    accessToken: string;
  }): GeocodingService;
}
